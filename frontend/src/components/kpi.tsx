export function Kpi({label,value,detail,tone="",progress,stale=false}:{label:string;value:string;detail?:string;tone?:string;progress?:number;stale?:boolean}){
 return <article className={`kpi ${tone}${stale ? " stale" : ""}`}>
  <div className="kpi-heading"><span>{label}</span>{stale&&<em>Previous run</em>}</div>
  <strong>{value}</strong>
  {detail&&<small>{detail}</small>}
  {typeof progress==="number"&&<div className="progress" role="progressbar" aria-label={label+" used"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{width:Math.min(100,progress)+"%"}}/></div>}
 </article>;
}
