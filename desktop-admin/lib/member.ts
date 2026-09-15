export type MemberContent={id:string;type:'text'|'image';text:string;image:string};
export type MemberEntry={id:string;title:string;image:string;enabled:boolean;content:MemberContent[]};
export type MemberProduct={id:string;title:string;image:string;points:number;visible:boolean;description:string;exchangeInstructions:string};
export type MemberConfig={version:1;hero:{visible:boolean;image:string;height:number};entries:{visible:boolean;height:number;items:MemberEntry[]};banner:{visible:boolean;image:string;height:number};products:{visible:boolean;title:string;items:MemberProduct[]}};
export type MemberRecord={config:MemberConfig;revision:string;updatedAt:string;updatedBy:string};
export type MemberPublication={revision:string|null;updatedAt:string;productCount:number;draftRevision:string|null};
export type MemberResult={draft:MemberRecord|null;record:MemberRecord;publication:MemberPublication}&MemberPublication;
export function memberDefaults():MemberConfig{return {version:1,hero:{visible:true,image:'',height:360},entries:{visible:true,height:330,items:[{id:'member-left',title:'会员权益',image:'',enabled:true,content:[]},{id:'member-right',title:'会员活动',image:'',enabled:true,content:[]}]},banner:{visible:true,image:'',height:180},products:{visible:true,title:'',items:[]}};}
