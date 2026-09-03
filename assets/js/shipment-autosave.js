export function createAutosaveQueue({save,onState=()=>{},setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout}){
  if(typeof save!=='function')throw new TypeError('save muss eine Funktion sein.');
  const delays=[2000,5000,10000,30000,60000];
  let pending={},timer=null,retry=0,disposed=false;

  async function flush(){
    if(disposed||!Object.keys(pending).length)return;
    timer=null;
    const patch=pending;pending={};onState('saving');
    try{
      await save(patch);
      retry=0;
      onState('saved');
    }catch(err){
      pending={...patch,...pending};
      onState('error',err);
      timer=setTimeoutFn(flush,delays[Math.min(retry++,delays.length-1)]);
    }
  }

  function queue(patch){
    if(disposed||!patch||typeof patch!=='object'||Array.isArray(patch))return;
    pending={...pending,...patch};
    if(timer)clearTimeoutFn(timer);
    timer=setTimeoutFn(flush,500);
  }

  return {
    queue,
    flush,
    dispose(){disposed=true;pending={};if(timer)clearTimeoutFn(timer);timer=null;}
  };
}
