import { makeAutoObservable,observable,runInAction } from "mobx";
import { ConfigKey } from "../../../utils/typed/config";
import { IPropertyWithName } from "../../components/table";
import { DefaultObject } from "realm/dist/public-types/schema/types";
import { OsuClients,OsuTables } from "../../../defines/types";
import g from "../../state";


interface State {
    path?: string;
    path_patch?: string;
    s_schema_keys?: IPropertyWithName[];
    s_schema_rows?: DefaultObject[];
    s_schema_rows_loaded?: boolean;
    s_schema_rows_page?: number;
    s_schema_name?: string
}

export default class Controller {
    state: State;

    constructor() {
        this.state={}

        g.initConfig();

        makeAutoObservable(this);
    }

    get Path() {
        return g.config?.[ConfigKey.PATH_STABLE_DIR]??""
    }

    get PathPatch() {
        return this.state.path_patch??""
    }

    get SSchemaKeys() {
        return this.state.s_schema_keys??[]
    }

    get SSchemaRows() {
        return this.state.s_schema_rows??[]
    }

    get SSchemaRowsLoaded() {
        return this.state.s_schema_rows_loaded??true;
    }

    get SSchemaName() {
        return this.state.s_schema_name;
    }

    get SSchemaRowsPage() {
        return this.state.s_schema_rows_page??0;
    }

    handleSelectFile=async () => {
        let result=await window.olsCore.openFile("Select directory for osu!stable","openDirectory",[]);
        if(result===undefined) return;
        await g.saveConfig(ConfigKey.PATH_STABLE_DIR,result);
    };

    onBtnPathPatchClicked=async () => {
        let result=await window.olsCore.exec("osustable.File.osz");
        runInAction(() => {
            this.state.path_patch=result;
        })
    };

    onBtnPathPatchV2Clicked=async () => {
        let result=await window.olsCore.exec("osu!");
        runInAction(() => {
            this.state.path_patch=result;
        })
    };

    onBtnCollectionClicked=async () => {
        //await window.olsCore.initStableReader(this.Path);
        //let result=await window.olsCore.getCollections();

        runInAction(() => {
            this.state.s_schema_name=OsuTables.BEATMAP_COLLECTION.toString();
            this.state.s_schema_rows=[];
            this.state.s_schema_rows_page=0;
            this.state.s_schema_rows_loaded=true;
            this.state.s_schema_keys=[{
                type: "string",
                name: "ID",
            },{
                type: "string",
                name: "Name",
            }];
        })
        await this.loadSchemaObjs();
    };


    onBtnReadOsuDBFileClicked=async () => {
        await window.olsCore.initStableReader(this.Path);
        let result=await window.olsCore.getBeatmaps(OsuClients.Stable);
        console.log(result);

    };

    onBtnReadScoresClicked=async () => {
        await window.olsCore.initStableReader(this.Path);
        let result=await window.olsCore.getScores(OsuClients.Stable);
        console.log(result);

    };

    loadSchemaObjs=async () => {
        if(!this.SSchemaRowsLoaded) return;

        const currentSchema=this.SSchemaName;
        if(!currentSchema) return;

        runInAction(() => {
            this.state.s_schema_rows_loaded=false;
        });

        await window.olsCore.initStableReader(this.Path);

        const nextPage=this.SSchemaRowsPage+1;

        try {
            let moreData: DefaultObject[]=[];
            switch(currentSchema) {
                case OsuTables.BEATMAP_COLLECTION.toString():
                    let result=await window.olsCore.getCollections();
                    moreData=result.data.map((data: any) => {
                        return {
                            ID: data.id,
                            Name: data.name,
                        };
                    });
                    break;
            }

            runInAction(() => {
                const rs=observable([...this.SSchemaRows,...moreData],{ deep: false });
                this.state.s_schema_rows=rs;
                this.state.s_schema_rows_page=nextPage;
            });
        } finally {
            runInAction(() => {
                this.state.s_schema_rows_loaded=true;
            });
        }
    };
}