import { makeAutoObservable,observable,runInAction } from "mobx";
import { IPropertyWithName } from "../../components/table";
import { DefaultObject } from "realm/dist/public-types/schema/types";
import g from "../../state";

interface State {
    path?: string;
    s_tables?: string[];
    s_schema_name?: string
    s_schema_keys?: IPropertyWithName[];
    s_schema_rows?: DefaultObject[];
    s_schema_rows_loaded?: boolean;
    s_schema_rows_page?: number;
}

const PAGE_SIZE=100;

export default class Controller {
    state: State;

    constructor() {
        this.state={}

        g.initConfig();

        makeAutoObservable(this);
    }

    get Path() {
        return g.config?.["path"]??""
    }

    get STables() {
        return this.state.s_tables??[]
    }

    get SSchemaKeys() {
        if(this.STables.length===0) return [];
        return this.state.s_schema_keys??[]
    }

    get SSchemaRows() {
        if(this.STables.length===0) return [];
        return this.state.s_schema_rows??[]
    }

    get SSchemaName() {
        return this.state.s_schema_name;
    }

    get SSchemaRowsLoaded() {
        return this.state.s_schema_rows_loaded??true;
    }

    get SSchemaRowsPage() {
        return this.state.s_schema_rows_page??0;
    }

    handleSelectFile=async () => {
        let result=await window.olsCore.openFile();
        if(result===undefined) return;
        await g.saveConfig("path",result);
    };

    onReadLazerBtnClicked=async () => {
        const reader=await window.olsCore.initReader(this.Path);

        if(reader!==undefined) {
            const schemas=await window.olsCore.getSchemas();
            const modelNames=schemas.map((data: any) => {
                return data.name;
            });
            console.log(schemas);

            this.state.s_tables=modelNames;
        }
    };

    onSchemaBtnClicked=async (name: string) => {
        this.state.s_schema_keys=[];
        this.state.s_schema_rows=[];
        const schema=await window.olsCore.getSchema(name);
        if(schema) {
            Object.entries(schema.properties).forEach(([propName,propSchema]) => {
                runInAction(() => {
                    this.state.s_schema_name=name;
                    this.state.s_schema_rows=[];
                    this.state.s_schema_rows_page=0;
                    this.state.s_schema_rows_loaded=true;
                    this.state.s_schema_keys=[...this.SSchemaKeys,{
                        ...propSchema
                    }];
                })
            });

            await this.loadSchemaObjs();
        }
    };

    loadSchemaObjs=async () => {
        if(!this.SSchemaRowsLoaded) return;

        const currentSchema=this.SSchemaName;
        if(!currentSchema) return;

        runInAction(() => {
            this.state.s_schema_rows_loaded=false;
        });


        const nextPage=this.SSchemaRowsPage+1;
        const offset=(nextPage-1)*PAGE_SIZE;

        try {
            const moreData=await window.olsCore.getSchemaObjs(currentSchema,PAGE_SIZE,offset);

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

    onCloseLazerBtnClicked=async () => {
        await window.olsCore.closeReader();

        this.state.s_tables=[];
    };
}