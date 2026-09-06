const db=require('./database');

const PRIORITIES=new Set(['P0','P1','P2','P3','P4']);
const STATUSES=new Set(['OPEN','DONE']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value){return String(value??'').trim();}
function invalid(message){throw Object.assign(new Error(message),{code:'INPUT_INVALID'});}
function optionalUuid(value,label){const id=text(value);if(!id)return null;if(!UUID.test(id))invalid(`${label} ist ungültig.`);return id;}
function requiredUuid(value,label){const id=optionalUuid(value,label);if(!id)invalid(`${label} fehlt.`);return id;}
function writeTenant(tenantId,fn){return db.withTenantClient(tenantId,fn,{write:true});}
function validDate(value){
  const raw=text(value);if(!raw)return null;
  const date=new Date(raw);if(Number.isNaN(date.getTime()))invalid('Aufgabentermin ist ungültig.');
  return date.toISOString();
}
function validateTaskInput(value={}){
  const title=text(value.title);if(title.length<2||title.length>200)invalid('Aufgabentitel muss zwischen 2 und 200 Zeichen lang sein.');
  const description=text(value.description);if(description.length>2000)invalid('Aufgabenbeschreibung ist zu lang.');
  const priority=text(value.priority||'P2').toUpperCase();if(!PRIORITIES.has(priority))invalid('Aufgabenpriorität ist ungültig.');
  const shipmentId=optionalUuid(value.shipmentId,'Sendungs-ID');
  return {title,description:description||null,priority,status:'OPEN',dueAt:validDate(value.dueAt),shipmentId};
}
function normalizeTaskStatus(value){const status=text(value).toUpperCase();if(!STATUSES.has(status))invalid('Aufgabenstatus ist ungültig.');return status;}

async function listTasks(tenantId,{status='all'}={}){
  const normalized=text(status).toUpperCase();
  return db.withTenantClient(tenantId,async client=>{
    const params=[],where=[];
    if(normalized&&normalized!=='ALL'){if(!STATUSES.has(normalized))invalid('Aufgabenstatus ist ungültig.');params.push(normalized);where.push(`t.status=$${params.length}`);}
    const result=await client.query(`
      select t.id,t.shipment_id,t.title,t.description,t.priority,t.status,t.due_at,t.created_by,t.completed_by,t.completed_at,t.created_at,t.updated_at,
             s.reference as shipment_reference
        from operational_tasks t
        left join shipments s on s.id=t.shipment_id and s.tenant_id=t.tenant_id
        ${where.length?`where ${where.join(' and ')}`:''}
       order by case t.status when 'OPEN' then 0 else 1 end,
                case t.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 else 4 end,
                t.due_at nulls last,t.created_at desc`,params);
    return result.rows;
  });
}

async function createTask(tenantId,userId,value={}){
  const task=validateTaskInput(value),actor=text(userId)||null;
  return writeTenant(tenantId,async client=>{
    if(task.shipmentId){
      const linked=await client.query('select id from shipments where id=$1 limit 1',[task.shipmentId]);
      if(!linked.rows[0])throw Object.assign(new Error('Verknüpfte Sendung wurde nicht gefunden.'),{code:'SHIPMENT_NOT_FOUND'});
    }
    const result=await client.query(`
      insert into operational_tasks(tenant_id,shipment_id,title,description,priority,status,due_at,created_by,created_at,updated_at)
      values(current_setting('app.tenant_id',true)::uuid,$1,$2,$3,$4,'OPEN',$5,$6,now(),now())
      returning id,shipment_id,title,description,priority,status,due_at,created_by,completed_by,completed_at,created_at,updated_at`,
      [task.shipmentId,task.title,task.description,task.priority,task.dueAt,actor]);
    return result.rows[0];
  });
}

async function setTaskStatus(tenantId,taskId,status,userId){
  const id=requiredUuid(taskId,'Aufgaben-ID');
  const next=normalizeTaskStatus(status),actor=text(userId)||null;
  return writeTenant(tenantId,async client=>{
    const result=await client.query(`
      update operational_tasks
         set status=$2,
             completed_by=case when $2='DONE' then $3::uuid else null end,
             completed_at=case when $2='DONE' then now() else null end,
             updated_at=now()
       where id=$1
       returning id,shipment_id,title,description,priority,status,due_at,created_by,completed_by,completed_at,created_at,updated_at`,
      [id,next,actor]);
    if(!result.rows[0])throw Object.assign(new Error('Aufgabe wurde nicht gefunden.'),{code:'TASK_NOT_FOUND'});
    return result.rows[0];
  });
}

module.exports={listTasks,createTask,setTaskStatus,validateTaskInput,normalizeTaskStatus};
