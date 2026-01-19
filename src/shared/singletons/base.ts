export default class SingletonBase {
    protected static _instance: SingletonBase|null=null;

    protected constructor() { }

    public static get getInstance() {
        if(this._instance===null) {
            this._instance=new this();
        }
        return this._instance;
    }
}