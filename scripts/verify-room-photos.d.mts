// ureten: opus. Types for the room-photo gate so unit tests can call it.
export declare const OPEN_LICENCE:RegExp;
export declare const DEFAULT_PRIVATE_CATALOGS:string[];
export declare function imageSize(bytes:Buffer):{type:'png'|'jpeg'|'webp';width:number;height:number}|null;
export declare function verifyRoomPhotos(options?:{root?:string;publicDir?:string;dist?:boolean;privateCatalogs?:string[]}):Promise<{ok:true;checked:string;photos:{id:string;file:string;bytes:number;sha256:string;licence:string}[];privateCatalogsChecked:string[];privateHashes:number}>;
