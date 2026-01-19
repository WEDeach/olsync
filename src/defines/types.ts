export enum OsuTables {
    BEATMAP=0,
    BEATMAP_COLLECTION=1,
}

export enum OsuClients {
    Stable=0,
    Lazer=1,
}

export interface IOsuCollection {
    name: string;
    maps: string[];
}

export enum HostType {
    FDM=0,
}

export const OsuLanguages=new Map<number,string>([
    [99,'Any'],
    [1,'Unspecified'],
    [2,'English'],
    [3,'Japanese'],
    [4,'Chinese'],
    [5,'Instrumental'],
    [6,'Korean'],
    [7,'French'],
    [8,'German'],
    [9,'Swedish'],
    [10,'Spanish'],
    [11,'Italian'],
    [12,'Russian'],
    [13,'Polish'],
    [14,'Other'],
]);

export const OsuModes=new Map<number,string>([
    [0,'Standard'],
    [1,'Taiko'],
    [2,'Catch'],
    [3,'Mania'],
]);