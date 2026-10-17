import {useLayoutEffect, useRef} from 'react';
import {House,FolderHeart,Files,Route,Network,AudioLines,FileText} from 'lucide-react';
const pages=[{name:'Home',icon:House},{name:'My case',icon:FolderHeart},{name:'Evidence',icon:Files},{name:'Timeline',icon:Route},{name:'Insights',icon:Network},{name:'Voice companion',icon:AudioLines},{name:'Reports',icon:FileText}];
// Transitions.dev's measured active-pill pattern, adapted to a responsive navigation.
export function Navigation({page,pending,onNavigate}:{page:string;pending:number;onNavigate:(name:string)=>void}){
 const nav=useRef<HTMLElement>(null);
 const positioned=useRef(false);
 useLayoutEffect(()=>{
   const root=nav.current!;
   const move=(animate:boolean)=>{
     const active=root.querySelector<HTMLElement>('[aria-current="page"]');
     const pill=root.querySelector<HTMLElement>('.nav-highlight');
     if(!active||!pill)return;
     pill.style.transition=animate?'':'none';
     pill.style.width=`${active.offsetWidth}px`;
     pill.style.height=`${active.offsetHeight}px`;
     pill.style.transform=`translate(${active.offsetLeft}px,${active.offsetTop}px)`;
     pill.style.opacity='1';
     if(!animate){void pill.offsetWidth;pill.style.transition='';}
   };
   move(positioned.current);positioned.current=true;
   let width=root.offsetWidth,height=root.offsetHeight;
   const observer=new ResizeObserver(()=>{if(root.offsetWidth!==width||root.offsetHeight!==height){width=root.offsetWidth;height=root.offsetHeight;move(false)}});observer.observe(root);
   return()=>observer.disconnect();
 },[page]);
 return <nav ref={nav} aria-label="Main navigation"><span aria-hidden="true" className="nav-highlight"/>{pages.map(({name,icon:Icon})=><button key={name} className={'nav-item '+(page===name?'active':'')} aria-current={page===name?'page':undefined} onClick={()=>onNavigate(name)}><Icon size={19} strokeWidth={1.65}/><span>{name}</span>{name==='Insights'&&pending>0&&<span className="count">{pending}</span>}</button>)}</nav>
}
