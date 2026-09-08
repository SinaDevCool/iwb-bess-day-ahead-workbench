export function Kpi({label,value,detail,tone="",progress}:{label:string;value:string;detail?:string;tone?:string;progress?:number}){
 return <article className={"kpi "+tone}><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}{typeof progress==="number"&&<div className="progress" role="progressbar" aria-label={label+" used"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{width:Math.min(100,progress)+"%"}}/></div>}</article>;
}
