export function Kpi({label,value,detail,stale=false}:{label:string;value:string;detail?:string;stale?:boolean}){
 return <article className={`kpi${stale ? " stale" : ""}`}>
  <div className="kpi-heading"><span>{label}</span>{stale&&<em>Previous run</em>}</div>
  <strong>{value}</strong>
  {detail&&<small>{detail}</small>}
 </article>;
}
