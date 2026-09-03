export function createAutosaveQueue({save,onState=()=>{},setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout}){
  if(typeof save!=='function')throw new TypeError('save muss eine Funktion sein.');
  const delays=[2000,5000,10000,30000,60000];
  let pending={},timer=null,retry=0,disposed=false,inFlight=null;

  function clearTimer(){if(timer){clearTimeoutFn(timer);timer=null;}}

  async function runSave(){
    if(disposed)return true;
    if(inFlight)return inFlight;
    if(!Object.keys(pending).length)return true;
    const patch=pending;pending={};onState('saving');
    inFlight=(async()=>{
      try{
        await save(patch);
        retry=0;
        onState('saved');
        return true;
      }catch(err){
        pending={...patch,...pending};
        onState('error',err);
        if(!disposed)timer=setTimeoutFn(scheduledFlush,delays[Math.min(retry++,delays.length-1)]);
        return false;
      }finally{
        inFlight=null;
      }
    })();
    return inFlight;
  }

  async function scheduledFlush(){
    timer=null;
    return runSave();
  }

  async function flush(){
    if(disposed)return true;
    clearTimer();
    if(inFlight){
      const ok=await inFlight;
      if(!ok)return false;
    }
    if(disposed)return true;
    if(Object.keys(pending).length)return runSave();
    return true;
  }

  function queue(patch){
    if(disposed||!patch||typeof patch!=='object'||Array.isArray(patch))return;
    pending={...pending,...patch};
    clearTimer();
    timer=setTimeoutFn(scheduledFlush,500);
  }

  return {
    queue,
    flush,
    dispose(){disposed=true;pending={};clearTimer();}
  };
}
