import {describe, expect, it} from 'vitest';
import {mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ENGINE_COMMIT, TARGET, REQUIRED_FILES, verifyPayload} from './lib/winsearch-payload.mjs';
import {assertCompiledBinding, assertIdentityMetadata, assertInventory, assertSignature, assertSigningMutation, checkVersions, inventory, releaseTag, isPortableExecutable, preparePayload, validateArchivePaths, verifyWinsearchRelease, vendors} from './release';

describe('release trust boundaries', () => {
  it('admits only the inspected retained Microsoft identities for the pinned WinSearch CRT files', async () => {
    const publisher = 'CN=Microsoft Windows Software Compatibility Publisher, O=Microsoft Corporation, L=Redmond, S=Washington, C=US';
    const corporation = 'CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US';
    const groups = [
      {files:['msvcp140.dll','vcruntime140.dll','vcruntime140_threads.dll'],primary:'81915C173D7FFCBF49EAA8CF7594696B29A035E1',nested:'3C9202BAFACBF9B5E3F1F1AC732C6BF4F98B4F27'},
      {files:['concrt140.dll','msvcp140_1.dll','msvcp140_2.dll','msvcp140_atomic_wait.dll','msvcp140_codecvt_ids.dll','vccorlib140.dll','vcruntime140_1.dll'],primary:'EC5F0D7EE2327688384B4FDF5D7633553A0D055F',nested:'EA2F8CBC69A1A01142A1EDD8B1256FECBC1D9F2D'},
    ];
    for (const group of groups) {
      const report = {status:'Valid',sha256:true,timestamped:true,subject:publisher,thumbprint:group.primary,signers:[{subject:corporation,thumbprint:group.nested}]};
      for (const file of group.files) {
        const identities = await vendors(`binaries/winsearch/${file}`);
        expect(() => assertSignature(report,identities)).not.toThrow();
        expect(() => assertSignature({...report,thumbprint:'0'.repeat(40)},identities)).toThrow(/signature/i);
      }
      expect(() => assertSignature(report,[])).toThrow(/signature/i);
      expect(await vendors('binaries/winsearch/winsearchd.exe')).toEqual([]);
    }
  });

  async function winsearchFixture(root:string) {
    const directory = join(root, 'staged/winsearch');
    const mapping:Record<string,string> = {};
    const files = [];
    for (const path of [...REQUIRED_FILES, 'notices/pdfium/licenses/test.txt']) {
      const bytes = Buffer.alloc(513);
      bytes.write('MZ'); bytes.writeUInt32LE(128,60); bytes.write('PE\0\0',128); bytes.writeUInt16LE(523,152);
      const target = join(directory,path);
      await mkdir(join(target,'..'), {recursive:true}); await writeFile(target,bytes);
      mapping[`binaries/winsearch/${path}`] = target;
      files.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length});
    }
    const manifest = Buffer.from(JSON.stringify({schemaVersion:1,engineCommit:ENGINE_COMMIT,target:TARGET,files}));
    mapping['binaries/winsearch/payload.json'] = join(directory,'payload.json');
    await writeFile(join(directory,'payload.json'),manifest);
    return {directory,mapping,expected:createHash('sha256').update(manifest).digest('hex')};
  }

  function signedPe(original:Buffer) {
    const signed = Buffer.concat([original,Buffer.alloc(7),Buffer.from('signature bytes!')]);
    signed.writeUInt32LE(123,216); signed.writeUInt32LE(520,296); signed.writeUInt32LE(16,300);
    return signed;
  }

  it('binds the WinSearch runtime manifest to verified final signing bytes and preserves pinned originals', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'lumen-release-winsearch-'));
    try {
      const fixture = await winsearchFixture(root);
      const result = await preparePayload(fixture.mapping,join(root,'originals'),async path => {
        const bytes = await readFile(path);
        if (isPortableExecutable(bytes)) await writeFile(path,signedPe(bytes));
      },fixture.expected);
      const final = await verifyPayload(fixture.directory,result.final['binaries/winsearch/payload.json'].sha256);
      expect(final.manifest.files[0].sizeBytes).toBe(536);
      expect(final.manifestSha256).not.toBe(fixture.expected);
      await verifyPayload(join(root,'originals/binaries/winsearch'),fixture.expected);
      expect(await verifyWinsearchRelease(fixture.mapping,join(root,'originals'),fixture.expected)).toBe(final.manifestSha256);
      await writeFile(join(fixture.directory,'payload.json'),JSON.stringify({...final.manifest,extra:'unapproved change'}));
      await expect(verifyWinsearchRelease(fixture.mapping,join(root,'originals'),fixture.expected)).rejects.toThrow(/manifest/i);
    } finally { await rm(root,{recursive:true,force:true}); }
  });

  it('rejects unpinned WinSearch input before any release signing', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'lumen-release-winsearch-'));
    try {
      const fixture = await winsearchFixture(root);
      await expect(preparePayload(fixture.mapping,join(root,'originals'),async path => {
        await writeFile(path,'must not sign unpinned input');
      },'0'.repeat(64))).rejects.toThrow(/manifest.*hash/i);
      await verifyPayload(fixture.directory,fixture.expected);
    } finally { await rm(root,{recursive:true,force:true}); }
  });

  it('refuses WinSearch signing that changes executable content', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'lumen-release-winsearch-'));
    try {
      const fixture = await winsearchFixture(root);
      await expect(preparePayload(fixture.mapping,join(root,'originals'),async path => {
        const original = await readFile(path);
        if (isPortableExecutable(original)) {
          const signed = signedPe(original); signed[500] ^= 1;
          await writeFile(path,signed);
        }
      },fixture.expected)).rejects.toThrow(/executable content/i);
    } finally { await rm(root,{recursive:true,force:true}); }
  });

  it('requires package, Tauri, Cargo and optional tag to agree', () => {
    expect(checkVersions('0.1.0', '0.1.0', '[package]\nversion = "0.1.0"\n[dependencies]\nfoo = "2"', 'v0.1.0')).toBe('0.1.0');
    expect(() => checkVersions('0.1.0', '0.1.0', '[package]\nversion = "0.2.0"')).toThrow(/version/i);
    expect(() => checkVersions('0.1.0', '0.2.0', '[package]\nversion = "0.1.0"')).toThrow(/version/i);
    expect(() => checkVersions('0.1.0', '0.1.0', '[package]\nversion = "0.1.0"', 'v0.2.0')).toThrow(/tag/i);
    // CI exports an empty RELEASE_TAG for builds that are not releases.
    expect(releaseTag({RELEASE_TAG: ''})).toBeUndefined();
    expect(releaseTag({})).toBeUndefined();
    expect(releaseTag({RELEASE_TAG: 'v0.1.0'})).toBe('v0.1.0');
  });

  it('requires the optional artifact to identify the Lumen package as well as its version and publisher', () => {
    const current = {packageName:'Bridgehammer.Lumen',packageVersion:'0.1.0.0',packagePublisher:'CN=Bridgehammer'};
    expect(() => assertIdentityMetadata(current,'0.1.0','CN=Bridgehammer')).not.toThrow();
    for (const changed of [{packageName:'Bridgehammer.Other'},{packageName:undefined},{packageVersion:'0.2.0.0'},{packagePublisher:'CN=Other'}]) {
      expect(() => assertIdentityMetadata({...current,...changed},'0.1.0','CN=Bridgehammer')).toThrow(/identity/i);
    }
  });

  it('detects PE bytes including PYD and refuses a DOS stub alone', () => {
    const bytes = Buffer.alloc(256); bytes.write('MZ'); bytes.writeUInt32LE(128, 60); bytes.write('PE\0\0', 128);
    expect(isPortableExecutable(bytes)).toBe(true);
    expect(isPortableExecutable(Buffer.from('MZjust data'))).toBe(false);
  });

  it('allows only Authenticode header changes, alignment padding and appended signature bytes', () => {
    const original = Buffer.alloc(513); original.write('MZ'); original.writeUInt32LE(128,60); original.write('PE\0\0',128); original.writeUInt16LE(523,152);
    original[500] = 42;
    const signed = Buffer.concat([original,Buffer.alloc(7),Buffer.from('signature bytes!')]);
    signed.writeUInt32LE(123,216); signed.writeUInt32LE(520,296); signed.writeUInt32LE(16,300);
    expect(() => assertSigningMutation(original,signed)).not.toThrow();
    const changed = Buffer.from(signed); changed[500] ^= 1;
    expect(() => assertSigningMutation(original,changed)).toThrow(/mutation/i);
    const moved = Buffer.from(signed); moved.writeUInt32LE(512,296);
    expect(() => assertSigningMutation(original,moved)).toThrow(/mutation/i);
    expect(() => assertSigningMutation(signed,changed)).toThrow(/retained/i);
  });

  it('rejects stale signed native output when the seal or Gateway changes', () => {
    const current = `lumen-release-v1:${'a'.repeat(64)}:${'b'.repeat(64)}`;
    expect(() => assertCompiledBinding(Buffer.from(`pe header ${current} rest`),current)).not.toThrow();
    expect(() => assertCompiledBinding(Buffer.from(current.replace('a'.repeat(64),'c'.repeat(64))),current)).toThrow(/binding/i);
    expect(() => assertCompiledBinding(Buffer.from(current.replace('b'.repeat(64),'c'.repeat(64))),current)).toThrow(/binding/i);
    expect(() => assertCompiledBinding(Buffer.from('unsigned upstream digest'),current)).toThrow(/binding/i);
  });

  it('requires trusted SHA256 timestamped signatures and exact approved identities', () => {
    const approved = {subject:'CN=fixture owner', thumbprint:'A'.repeat(40)};
    const valid = {...approved, status:'Valid', sha256:true, timestamped:true};
    expect(() => assertSignature(valid, [approved])).not.toThrow();
    for (const changed of [{status:'NotSigned'}, {sha256:false}, {timestamped:false}, {thumbprint:'B'.repeat(40)}, {subject:'CN=other'}]) {
      expect(() => assertSignature({...valid, ...changed}, [approved])).toThrow(/signature/i);
    }
    expect(() => assertSignature(valid, [])).toThrow(/signature/i);
    expect(() => assertSignature({...valid,signers:[approved,{subject:'CN=unexpected nested signer',thumbprint:'B'.repeat(40)}]}, [approved])).toThrow(/signature/i);
  });

  it('preserves original bytes before mutation and seals only the final signed copy', async () => {
    // Windows runner TEMP can use an 8.3 alias; release inputs require canonical paths.
    const root = await mkdtemp(join(await realpath(tmpdir()), 'lumen-release-test-'));
    try {
      const staged = join(root, 'payload.pyd'); await writeFile(staged, 'upstream verified');
      const mapping = {'nested/payload.pyd':staged};
      let signingCalled = false;
      const result = await preparePayload(mapping, join(root, 'originals'), async path => {
        expect((await readFile(join(root, 'originals/nested/payload.pyd'))).toString()).toBe('upstream verified');
        signingCalled = true; await writeFile(path, 'final signed bytes');
      });
      expect(signingCalled).toBe(true);
      expect(result.original['nested/payload.pyd'].sha256).not.toBe(result.final['nested/payload.pyd'].sha256);
      await assertInventory(mapping, result.final);
      await writeFile(staged, 'tampered');
      await expect(assertInventory(mapping, result.final)).rejects.toThrow(/seal/i);
      await expect(assertInventory({}, result.final)).rejects.toThrow(/seal/i);
      await expect(assertInventory({...mapping, extra:staged}, result.final)).rejects.toThrow(/seal/i);
    } finally { await rm(root, {recursive:true, force:true}); }
  });

  it('rejects colliding installed paths and captures non-PE resources too', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'lumen-release-test-'));
    try {
      await mkdir(join(root, 'data')); const file = join(root, 'data/file.txt'); await writeFile(file, 'owned data');
      expect(Object.keys(await inventory({'data/file.txt':file}))).toEqual(['data/file.txt']);
      await expect(inventory({'x.dll':file, 'X.dll':file})).rejects.toThrow(/collision/i);
    } finally { await rm(root, {recursive:true, force:true}); }
  });

  it('rejects a directory junction in a release source path', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'lumen-release-test-'));
    try {
      const source = join(root, 'source'); await mkdir(source);
      await writeFile(join(source, 'runtime.dll'), 'pinned input');
      const alias = join(root, 'alias'); await symlink(source, alias, 'junction');
      await expect(inventory({'runtime.dll':join(alias, 'runtime.dll')})).rejects.toThrow(/reparse/i);
      expect((await readFile(join(source, 'runtime.dll'))).toString()).toBe('pinned input');
    } finally { await rm(root, {recursive:true, force:true}); }
  });

  it('rejects archive traversal and overwrite collisions before extraction', () => {
    expect(validateArchivePaths('Path = lumen.exe\nSize = 10\n\nPath = $PLUGINSDIR/System.dll\nSize = 20\n')).toEqual(['lumen.exe','$PLUGINSDIR/System.dll']);
    for (const name of ['../outside.exe','C:/outside.exe','/outside.exe','a/../outside.exe','a:stream','.. /outside.exe','a./file.exe']) {
      expect(() => validateArchivePaths(`Path = ${name}\nSize = 10\n`)).toThrow(/archive/i);
    }
    expect(() => validateArchivePaths('Path = x.dll\nSize = 1\n\nPath = X.dll\nSize = 2\n')).toThrow(/archive/i);
    expect(() => validateArchivePaths('')).toThrow(/archive/i);
  });

  it('retains original provenance when signing fails and never returns a final seal', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'lumen-release-test-'));
    try {
      const file = join(root, 'runtime.dll'); await writeFile(file,'pinned input');
      await expect(preparePayload({'runtime.dll':file},join(root,'originals'),async () => { throw new Error('timestamp refused'); })).rejects.toThrow('timestamp refused');
      expect((await readFile(join(root,'originals/runtime.dll'))).toString()).toBe('pinned input');
      expect((await readFile(file)).toString()).toBe('pinned input');
    } finally { await rm(root,{recursive:true,force:true}); }
  });
});
