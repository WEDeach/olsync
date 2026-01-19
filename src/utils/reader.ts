import { DefaultObject,RealmObject,Results } from "realm/dist/public-types/namespace";

export type DefaultObjectWithOffset={ offset: number,next_offset: number,data: any[],total: number,limit: number };
export type DefaultFunctionWithOffset=(offset: number,limit: number) => Promise<DefaultObjectWithOffset>;

export function readWithOffset(source: any[]|Results<RealmObject<DefaultObject,never>&DefaultObject>,offset: number,limit: number): DefaultObjectWithOffset {
    const s=source.slice(offset,offset+limit);
    return { offset: offset,data: s,total: source.length,limit: limit,next_offset: Math.min(offset+s.length,source.length) };
}

export async function readAllWithOffset(callable: DefaultFunctionWithOffset,offset: DefaultObjectWithOffset): Promise<DefaultObjectWithOffset> {
    let limit=offset.limit,next_offset=offset.next_offset,total=offset.total;
    let d=offset.data;
    let i=0;
    if(total!==d.length) {
        d=new Array(total);
        d.fill(undefined);
        for(let item of offset.data) {
            d[i++]=item;
        }
    } else {
        i=offset.next_offset;
    }
    if(i!==offset.next_offset) throw new Error(`offset error: ${offset.next_offset} ${i}`);
    while(total>next_offset) {
        const result=await callable(next_offset,limit);
        for(let item of result.data) {
            d[i++]=item;
        }
        next_offset=result.next_offset;
    }
    offset.data=d;
    offset.next_offset=next_offset;
    return offset;
}