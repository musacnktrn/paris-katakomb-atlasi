// ureten: opus. Types for the privacy gate so unit tests can call it.
export declare const BASE_MARKERS:{label:string;re:RegExp}[];
export declare const MAX_PRIVATE_BYTES:number;
export declare function pmtilesMetadata(bytes:Buffer):string|null;
// ureten: codex: source publication is gated together with built assets.
export declare function verifyNoPrivate(options?:{root?:string;targets?:string[];sourceTargets?:string[]}):Promise<{ok:true;targets:string[];sourceTargets:string[];sourceTextFiles:number;files:number;textFiles:number;pmtilesScanned:number;markers:number;privateMarkers:number;hashCheck:string|{privateFiles:number;skippedCacheDirs:number;skippedOver300MB:number;hashedSizeMatches:number;allowed:{private:string;public:string;reason:string}[]};ms:number}>;
