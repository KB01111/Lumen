import {describe,expect,it,vi} from 'vitest';
import {EngineSearchService} from './engine-search-service';
import {MemorySearchService} from './memory-search-service';
import type {SearchRequest} from './search.types';

const request:SearchRequest={requestId:1,query:'report',scope:'all',filters:[],limit:10_000};
const policy={hydrated:true,roots:[],paused:false,semanticEnabled:false,preferredBackend:'cpu'};
const hybridEmpty={items:[],semantic:{phase:'disabled',reason:null}};
const hit={stableId:'winsearch:e1',rootPath:'C:\\Docs',path:'C:\\Docs\\report.pdf',name:'report.pdf',
  contentHash:'a'.repeat(64),indexRevision:1,extractionKind:'winsearch',snippet:'report line',page:null,
  timeStartMs:null,timeEndMs:null,rank:0.2,
  metadata:{path:'C:\\Docs\\report.pdf',relativePath:'report.pdf',name:'report.pdf',kind:'pdf',extension:'pdf',sizeBytes:12,modifiedMs:null},
  matchSource:'content',semanticScore:null,embeddingModel:null,pinned:false};
const hybridHit={items:[hit],semantic:{phase:'disabled',reason:null}};
vi.mock('@tauri-apps/api/core',()=>({Channel:class {onmessage?:unknown;}}));

describe('owned engine SearchService',()=>{
  it('waits for hydrated settings and acknowledges explicit empty roots before search',async()=>{
    let hydrated=false;
    const invoke=vi.fn(async(command:string)=>command==='configure_winsearch_engine'?undefined:hybridEmpty);
    const service=new EngineSearchService({getPolicy:()=>({...policy,hydrated}),host:new MemorySearchService(),invoke});
    await expect(service.search(request)).rejects.toMatchObject({code:'unavailable'});
    expect(invoke).not.toHaveBeenCalled();
    hydrated=true;
    expect(await service.search(request)).toMatchObject({requestId:1,groups:[],total:0});
    expect(invoke.mock.calls.map(([command])=>command)).toEqual(['configure_winsearch_engine','search_winsearch']);
  });

  it('streams accumulated launcher snapshots and closes delivery after completion',async()=>{
    let channel:{onmessage:(value:unknown)=>void}|undefined;
    const invoke=vi.fn(async(command:string,args?:Record<string,unknown>)=>{
      if(command==='configure_winsearch_engine')return;
      channel=args?.onUpdate as typeof channel;
      channel!.onmessage(hybridHit);
      return hybridHit;
    });
    const service=new EngineSearchService({getPolicy:()=>policy,host:new MemorySearchService(),invoke});
    const update=vi.fn();
    const result=await service.search(request,undefined,update);
    expect(result.total).toBe(1);
    expect(result.groups[0]!.items[0]).toMatchObject({id:'winsearch:e1',kind:'pdf',match:{source:'content',score:0.8}});
    expect(update).toHaveBeenCalledTimes(1);
    channel!.onmessage(hybridEmpty);
    expect(update).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenLastCalledWith('search_winsearch',expect.objectContaining({requestId:1,limit:10_000,onUpdate:expect.anything()}));
  });

  it('propagates AbortSignal to native cancellation and rejects late results',async()=>{
    let finish!:(value:unknown)=>void;
    const invoke=vi.fn((command:string)=>command==='search_winsearch'?new Promise(resolve=>{finish=resolve;}):Promise.resolve());
    const service=new EngineSearchService({getPolicy:()=>policy,host:new MemorySearchService(),invoke});
    const abort=new AbortController();
    const result=service.search(request,abort.signal);
    await vi.waitFor(()=>expect(finish).toBeDefined());
    abort.abort();
    await expect(result).rejects.toMatchObject({name:'AbortError'});
    finish(hybridEmpty);
    expect(invoke).toHaveBeenCalledWith('cancel_winsearch_search',{requestId:1});
  });

  it('rejects delivery after grants change even before successor configuration',async()=>{
    let current={...policy};
    const invoke=vi.fn(async(command:string)=>{
      if(command==='search_winsearch'){current={...policy,paused:true};return hybridEmpty;}
    });
    const service=new EngineSearchService({getPolicy:()=>current,host:new MemorySearchService(),invoke});
    await expect(service.search(request)).rejects.toMatchObject({name:'AbortError'});
  });

  it('returns a truthful recoverable error instead of starting a filename crawler',async()=>{
    const invoke=vi.fn(async()=>{throw {code:'engine-unavailable',message:'Payload missing'};});
    const service=new EngineSearchService({getPolicy:()=>policy,host:new MemorySearchService(),invoke});
    await expect(service.search(request)).rejects.toMatchObject({code:'unavailable',recoverable:true});
    expect(invoke.mock.calls).toHaveLength(1);
  });

  it('preserves empty query Recent through the host ledger',async()=>{
    const host=new MemorySearchService();
    const invoke=vi.fn(async()=>undefined);
    const service=new EngineSearchService({getPolicy:()=>policy,host,invoke});
    const recent=service.search({...request,query:'',scope:'recent'});
    await vi.waitFor(()=>expect(host.requests).toHaveLength(1));
    await host.resolve('',[],1);
    expect(await recent).toMatchObject({requestId:1,total:0});
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('maps degraded terminal semantics to the existing status contract',async()=>{
    const status=vi.fn();
    const invoke=vi.fn(async(command:string)=>command==='search_winsearch'
      ?{...hybridEmpty,semantic:{phase:'degraded',reason:'Semantic model unavailable'}}:undefined);
    const service=new EngineSearchService({getPolicy:()=>policy,host:new MemorySearchService(),invoke});
    const unsubscribe=service.subscribeToStatus(status);
    await service.search(request);
    expect(status).toHaveBeenCalledWith(expect.objectContaining({phase:'degraded',message:'Semantic model unavailable'}));
    unsubscribe();
  });
});
