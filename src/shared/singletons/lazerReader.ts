import Realm from 'realm';
import SingletonBase from './base';
import { readWithOffset } from '../../utils/reader';
import { IOsuCollection } from '../../defines/types';

export default class LazerReader extends SingletonBase {
    realm?: Realm;

    init(fpath: string) {
        if(this.realm!==undefined) {
            // throw new Error("LazerReader has been initialized.");
            this.realm.close();
        }
        this.realm=new Realm({
            path: fpath,
            disableFormatUpgrade: false,
            // openSyncedRealmLocally: true,
            schema: undefined,
            schemaVersion: undefined
        } satisfies Realm.Configuration&{
            openSyncedRealmLocally?: boolean;
        } as any);
    }

    get_schemas() {
        if(this.realm===undefined) {
            throw new Error("LazerReader has not been initialized.");
        }
        return this.realm.schema
    }

    get_schema_by_name(name: string) {
        if(this.realm===undefined) {
            throw new Error("LazerReader has not been initialized.");
        }
        return this.get_schemas().find((s) => s.name===name)
    }

    get_objects(type: string,limit: number=10,offset: number=0) {
        if(this.realm===undefined) {
            throw new Error("LazerReader has not been initialized.");
        }
        const results=this.realm.objects(type);

        return results.slice(offset,offset+limit).map(obj => obj.toJSON());
    }

    get_collections(offset: number=0,limit: number=10) {
        if(this.realm===undefined) {
            throw new Error("LazerReader has not been initialized.");
        }
        const collections=this.realm.objects("BeatmapCollection");
        const result=readWithOffset(collections,offset,limit);
        result.data=result.data.map((obj: Realm.Results) => obj.toJSON());
        return result;
    }
    set_collections(collections: IOsuCollection[]) {
        if(this.realm===undefined) {
            throw new Error("LazerReader has not been initialized.");
        }
        throw new Error("LazerReader's set_collections is not implemented.");
    }

    close() {
        if(this.realm===undefined) {
            throw new Error("LazerReader has not been initialized.");
        }
        this.realm.close();
        this.realm=undefined;
    }
}