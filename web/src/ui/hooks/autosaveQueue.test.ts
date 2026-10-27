import {afterEach,expect,it,vi} from 'vitest'
import {createAutosaveQueue} from './autosaveQueue'
afterEach(()=>vi.useRealTimers())
it('does not save hydrated data and coalesces rapid edits',async()=>{
 vi.useFakeTimers();const save=vi.fn(async()=>{}),notify=vi.fn(),queue=createAutosaveQueue({name:'original'},save,notify)
 queue.update({name:'original'});await vi.advanceTimersByTimeAsync(700);expect(save).not.toHaveBeenCalled()
 queue.update({name:'a'});expect(queue.isSaved({name:'a'})).toBe(false);queue.update({name:'latest'});await vi.advanceTimersByTimeAsync(700)
 expect(save).toHaveBeenCalledTimes(1);expect(save).toHaveBeenLastCalledWith({name:'latest'},{name:'original'});expect(queue.state().status).toBe('saved');queue.dispose()
})
it('serializes slow saves and preserves edits and reversions made during a request',async()=>{
 vi.useFakeTimers();let release!:()=>void;const values:string[]=[]
 const queue=createAutosaveQueue('original',async value=>{values.push(value);if(value==='first')await new Promise<void>(resolve=>release=resolve)},()=>{})
 queue.update('first');await vi.advanceTimersByTimeAsync(600);queue.update('original');queue.update('latest');await vi.advanceTimersByTimeAsync(600)
 expect(values).toEqual(['first']);release();await queue.flush();expect(values).toEqual(['first','latest']);expect(queue.state().status).toBe('saved');queue.dispose()
})
it('retains errors for manual retry and flushes pending edits when leaving',async()=>{
 vi.useFakeTimers();const save=vi.fn().mockRejectedValueOnce(Error('Offline')).mockResolvedValue(undefined),notify=vi.fn()
 const queue=createAutosaveQueue('old',save,notify);queue.update('new');await vi.advanceTimersByTimeAsync(700)
 expect(queue.state()).toEqual({status:'error',error:'Offline'});await vi.advanceTimersByTimeAsync(2000);expect(save).toHaveBeenCalledTimes(1)
 expect(await queue.retry()).toBe(true);queue.update('last');queue.dispose();await queue.flush();expect(save).toHaveBeenLastCalledWith('last','new')
})
it('keeps account sessions and failed requests separate',async()=>{
 const first=vi.fn(async()=>{}),second=vi.fn(async()=>{})
 const old=createAutosaveQueue('a',first,()=>{});old.update('b');old.dispose()
 const next=createAutosaveQueue('c',second,()=>{});await old.flush();expect(first).toHaveBeenCalledWith('b','a');expect(second).not.toHaveBeenCalled();next.dispose()
})
