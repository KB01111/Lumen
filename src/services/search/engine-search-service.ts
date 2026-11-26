import {Channel,invoke as nativeInvoke} from '@tauri-apps/api/core';
import {z} from 'zod';
import type {IndexRootInput} from '../ai/native-ai-service';
import type {SearchService} from './search-service';
import {searchRequestSchema,searchResponseSchema,searchResultKindSchema,searchStatusSchema,type SearchRequest,type SearchResponse,type SearchResult,type SearchStatus} from './search.types';

export interface EnginePolicy {
  hydrated:boolean;
  roots:readonly IndexRootInput[];
  paused:boolean;
  semanticEnabled:boolean;
  preferredBackend:string;
}
type Invoke=(command:string,args?:Record<string,unknown>)=>Promise<unknown>;
interface Options {getPolicy:()=>EnginePolicy;host:SearchService;invoke?:Invoke}
const unavailable=(message:string)=>({code:'unavailable' as const,message,recoverable:true});
const aborted=()=>new DOMException('Search superseded or canceled.','AbortError');
const nativeStatus=searchStatusSchema.omit({updatedAt:true}).extend({updatedAtMs:z.number().int().nonnegative()}).transform(({updatedAtMs,...status})=>({...status,updatedAt:new Date(updatedAtMs).toISOString()}));

// The engine answers through main's launcher search command, so this adapter reuses its
// confinement, pin and provenance mapping instead of owning a second engine search path.
const rustFileSchema=z.object({
  path:z.string().min(1),relativePath:z.string().min(1),name:z.string().min(1),kind:searchResultKindSchema,
  extension:z.string().nullable().optional(),sizeBytes:z.number().int().nonnegative(),modifiedMs:z.number().int().nonnegative().nullable().optional(),
});
const rustHybridHitSchema=z.object({
  stableId:z.string().min(1),rootPath:z.string().min(1),path:z.string().min(1),name:z.string().min(1),
  contentHash:z.string().min(1),indexRevision:z.number().int().positive(),extractionKind:z.string().min(1),
  snippet:z.string().optional(),page:z.number().int().positive().nullable().optional(),
  timeStartMs:z.number().int().nonnegative().nullable().optional(),timeEndMs:z.number().int().nonnegative().nullable().optional(),
  rank:z.number().min(0).max(1),metadata:rustFileSchema,
  matchSource:z.enum(['filename','content','metadata','ocr','semantic','related']),
  semanticScore:z.number().min(0).max(1).nullable().optional(),embeddingModel:z.string().min(1).nullable().optional(),pinned:z.boolean(),
});
const hybridResponseSchema=z.object({
  items:z.array(rustHybridHitSchema),
  semantic:z.object({phase:z.enum(['disabled','ready','degraded']),reason:z.string().min(1).max(256).nullable()}),
});
type HybridHit=z.infer<typeof rustHybridHitSchema>;

function mapHit(item:HybridHit):SearchResult{
  return {
    id:item.stableId,name:item.name,path:item.path,kind:item.metadata.kind,
    match:{source:item.matchSource,score:1-item.rank,
      fragment:['content','ocr','semantic','related'].includes(item.matchSource)?item.snippet:undefined},
    metadata:{extension:item.metadata.extension??undefined,sizeBytes:item.metadata.sizeBytes,
      modifiedAt:item.metadata.modifiedMs==null?undefined:new Date(item.metadata.modifiedMs).toISOString()},
    pinned:item.pinned,
    provenance:{extractionKind:item.extractionKind,fileHash:item.contentHash,page:item.page??undefined,
      timeStartMs:item.timeStartMs??undefined,timeEndMs:item.timeEndMs??undefined,
      embeddingModel:item.embeddingModel??undefined,indexRevision:item.indexRevision},
    availability:'available',
  };
}

// Opt-in until the host ledger/source-consumer migration owns the composition root.
export class EngineSearchService implements SearchService {
  private readonly invoke:Invoke;
  private readonly listeners=new Set<(status:SearchStatus)=>void>();
  private latest=0;
  private admission:Promise<void>=Promise.resolve();
  private subscriptionId?:number;
  private nextSubscription=0;
  constructor(private readonly options:Options){this.invoke=options.invoke??nativeInvoke;}

  private policy(){
    const policy=this.options.getPolicy();
    if(!policy.hydrated)throw unavailable('Search settings are still loading.');
    return JSON.parse(JSON.stringify(policy)) as EnginePolicy;
  }

  async search(request:SearchRequest,signal?:AbortSignal,onUpdate?:(snapshot:SearchResponse)=>void):Promise<SearchResponse>{
    signal?.throwIfAborted();
    searchRequestSchema.parse(request);
    const startedAt=performance.now();
    const operation=++this.latest;
    let policy=this.policy();
    let signature=JSON.stringify(policy);
    let receiving=true;
    const current=()=>receiving && operation===this.latest && !signal?.aborted && JSON.stringify(this.options.getPolicy())===signature;
    const check=()=>{if(!current())throw aborted();};
    const cancel=()=>{void this.invoke('cancel_winsearch_search',{requestId:request.requestId}).catch(()=>undefined);};
    let rejectAbort!:(reason:unknown)=>void;
    const interruption=new Promise<never>((_,reject)=>{rejectAbort=reject;});
    const abort=()=>{cancel();rejectAbort(aborted());};
    signal?.addEventListener('abort',abort,{once:true});
    const publish=(raw:unknown):SearchResponse=>{
      const parsed=hybridResponseSchema.parse(raw);
      const items=parsed.items.map(mapHit).slice(0,request.limit);
      return searchResponseSchema.parse({requestId:request.requestId,
        groups:items.length?[{id:'local-files',label:'Local files',items}]:[],
        elapsedMs:Math.max(0,performance.now()-startedAt),total:items.length});
    };
    const run=async()=>{
      // Keep the mutation lane ordered. A caller waits for acknowledgement of
      // its current hydrated snapshot, including an explicitly empty root list.
      for(;;){
        const captured=policy;
        const admission=this.admission.then(async()=>{await this.invoke('configure_winsearch_engine',{policy:captured});});
        this.admission=admission.catch(()=>undefined);
        await admission;
        if(operation!==this.latest || signal?.aborted)throw aborted();
        const now=this.policy();
        if(JSON.stringify(now)===signature)break;
        policy=now;signature=JSON.stringify(now);
      }
      check();
      this.startStatusSubscription();
      // Recent and Related stay on the host ledger/index, matching the launcher path: the
      // engine's entry identities are not durable host bindings.
      if(request.scope==='recent' || request.scope==='related' || !request.query.trim()){
        const hostRequest=request.scope==='related'?request:{...request,scope:'recent' as const};
        const response=await this.options.host.search(hostRequest,signal,snapshot=>{if(current())onUpdate?.(searchResponseSchema.parse(snapshot));});
        check();return searchResponseSchema.parse(response);
      }
      let invalid:unknown;
      const channel=new Channel<unknown>();
      channel.onmessage=value=>{
        if(!current())return;
        const parsed=hybridResponseSchema.safeParse(value);
        if(!parsed.success){invalid={code:'invalid-response',message:'The search engine returned an invalid snapshot.',recoverable:true};cancel();return;}
        onUpdate?.(publish(parsed.data));
      };
      const raw=await this.invoke('search_winsearch',{requestId:request.requestId,query:request.query,scope:request.scope,
        filters:request.filters.map(({id,value})=>({id,value})),limit:request.limit,
        semanticEnabled:policy.semanticEnabled,onUpdate:channel});
      check();
      if(invalid)throw invalid;
      const response=publish(raw);
      const semantic=hybridResponseSchema.parse(raw).semantic;
      if(semantic.phase==='degraded'){
        const status:SearchStatus={phase:'degraded',message:semantic.reason??'Semantic search degraded; exact results remain available.',updatedAt:new Date().toISOString()};
        for(const listener of this.listeners)listener(status);
      }
      return response;
    };
    try{return await Promise.race([run(),interruption]);}
    catch(error){
      if(error instanceof DOMException && error.name==='AbortError')throw error;
      const failure=error as {code?:string;message?:string};
      if(failure?.code==='canceled' || failure?.code==='superseded')throw aborted();
      if(failure?.code==='invalid-response' || error instanceof z.ZodError)throw {code:'invalid-response',message:'The local search engine returned an invalid response.',recoverable:true};
      throw unavailable(failure?.message??'The local search engine is unavailable.');
    }finally{receiving=false;signal?.removeEventListener('abort',abort);}
  }

  async getPreview(fileId:string,signal?:AbortSignal){
    if(!fileId.startsWith('engine:') && !fileId.startsWith('winsearch:'))return this.options.host.getPreview(fileId,signal);
    throw unavailable('Engine previews require the source-consumer migration.');
  }
  async openFile(fileId:string){
    if(!fileId.startsWith('engine:') && !fileId.startsWith('winsearch:'))return this.options.host.openFile(fileId);
    throw unavailable('Engine actions require the source-consumer migration.');
  }
  async openContainingFolder(fileId:string){
    if(!fileId.startsWith('engine:') && !fileId.startsWith('winsearch:'))return this.options.host.openContainingFolder(fileId);
    throw unavailable('Engine actions require the source-consumer migration.');
  }
  async setPinned(fileId:string,pinned:boolean){
    if(!fileId.startsWith('engine:') && !fileId.startsWith('winsearch:'))return this.options.host.setPinned(fileId,pinned);
    throw unavailable('Engine pins require the host-ledger migration.');
  }
  subscribeToStatus(listener:(status:SearchStatus)=>void){
    this.listeners.add(listener);
    this.startStatusSubscription();
    return ()=>{
      this.listeners.delete(listener);
      if(!this.listeners.size && this.subscriptionId!==undefined){
        const id=this.subscriptionId;this.subscriptionId=undefined;
        void this.invoke('unsubscribe_winsearch_engine',{subscriptionId:id}).catch(()=>undefined);
      }
    };
  }
  private startStatusSubscription(){
    if(this.listeners.size && this.subscriptionId===undefined){
      const id=++this.nextSubscription;
      this.subscriptionId=id;
      const channel=new Channel<unknown>();
      channel.onmessage=raw=>{
        if(this.subscriptionId!==id)return;
        const parsed=nativeStatus.safeParse(raw);
        if(parsed.success)for(const subscriber of this.listeners)subscriber(parsed.data);
      };
      void this.invoke('subscribe_winsearch_engine',{subscriptionId:id,onStatus:channel}).catch(()=>{
        if(this.subscriptionId!==id)return;
        this.subscriptionId=undefined;
        const status:SearchStatus={phase:'degraded',message:'The local search engine is unavailable. Retry search to reconnect.',updatedAt:new Date().toISOString()};
        for(const subscriber of this.listeners)subscriber(status);
      });
    }
  }
}
