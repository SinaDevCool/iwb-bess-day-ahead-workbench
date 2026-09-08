import Link from "next/link";
import { ArrowRight,BatteryCharging,ChartNoAxesCombined,ClipboardCheck,ShieldCheck,ShoppingCart } from "lucide-react";
import "./present.css";
const stages=[
 ["01","Frame","100 MWh / 50 MW","Define economics and physical limits.",<BatteryCharging key="a"/>],
 ["02","Optimize","Feasible dispatch","Maximize net contribution after losses and degradation.",<ChartNoAxesCombined key="b"/>],
 ["03","Generate","BUY & SELL orders","Translate each dispatch interval into an auction-ready draft.",<ShoppingCart key="c"/>],
 ["04","Validate","Physical proof","Check SoC, power, cycles, availability and terminal energy.",<ClipboardCheck key="d"/>],
 ["05","Control","Trader approval","Record interventions, revalidate and preserve an audit trail.",<ShieldCheck key="e"/>],
] as const;
export default function Present(){
 return <main className="present"><header className="present-head"><div className="logo">IWB</div><div><span>SECOND INTERVIEW · 10-MINUTE LIVE DEMONSTRATION</span><h1>BESS Day-Ahead Workbench</h1><p>What should IWB trade tomorrow, why is it optimal, and can it be executed safely?</p></div></header><section className="present-outcome"><div><small>BUSINESS OUTCOME</small><strong>Profitable</strong><span>Net contribution after losses and degradation</span></div><div><small>PHYSICAL OUTCOME</small><strong>Feasible</strong><span>Battery and market limits proven before approval</span></div><div><small>OPERATING MODEL</small><strong>Controlled</strong><span>Trader-in-the-loop with reproducible evidence</span></div></section><section className="story" aria-label="Demonstration flow">{stages.map(([n,title,value,body,icon])=><article key={n}><span className="story-number">{n}</span>{icon}<div><small>{title}</small><h2>{value}</h2><p>{body}</p></div></article>)}</section><section className="present-close"><div><small>DESIGN PRINCIPLE</small><strong>Forecast → feasible schedule → explainable economics → validated orders → trader control</strong></div><Link href="/">Open Live Workbench <ArrowRight size={18}/></Link></section><footer><span>Illustrative interview prototype</span><span>Swiss auction parameters remain assumptions pending IWB confirmation.</span></footer></main>;
}
