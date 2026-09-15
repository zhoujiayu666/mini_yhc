import type {Config} from './editor';
export type Product={sku:string;name:string;price:number;originalPrice:number;stock:number;image:string};
export type Operator={name:string;username:string;role:string};
export type Template={id:string;name:string;date:string;config:Config};
export type CloudLink={accessCode:string;revision:string|null;updatedAt:string};
export type OpsResult=CloudLink & {
 productCount:number;draftRevision:string|null;
 products:Product[];ok:boolean;error?:string;code:string;user:Operator;
 draft:({config:Config;updatedBy:string}&CloudLink)|null;
 templates:{revision:string;items:Template[]}|null;
 link:CloudLink|null;record:{revision:string;config?:Config};
 id:string;src:string;url:string;mime:string;
 upload:{url:string;token:string;authorization:string;cosFileId:string;cloudPath:string};
};
