
function SysInit(){
    // $("head").append($(`
    //     <style>
    //         p{
    //             background:red;
    //         }    
    //     </style>
    // `)[0]);
}

function GenNonDuplicateID(randomLength=9){
    let idStr = Date.now().toString(36)
    idStr += Math.random().toString(36).substr(3,randomLength)
    return idStr;
}

class Bus{
    constructor(){
        this.Message={};
        this.events={};
    }
    listen(event,callback){
        if(!this.events[event]){
            this.events[event]=[];
        }
        this.events[event].push(callback);
        return this;
    }
    emit(event,args){
        const callbackList = this.events[event];
        if(callbackList&&callbackList.length){
            callbackList.forEach(cb => cb(args));
        }
        return this;
    }
    off(event,callback){
        if(event){
            if(this.events[event]&&callback){
                let index = this.events[event].indexOf(callback);
                if(index>-1){
                    this.events[event].splice(index,1);
                }
            }else{
                delete this.events[event];
            }
        }else{
            delete this.events;
        }
    }
    post(msg){
        this.Message=msg;
    }
    register(frame){
        frame.parent = this.container;
        this.listen(frame.id,frame.handle);
        this.listen("broadcast",frame.handle);
        frame.visible = true;
    }
}

const Channel=new Proxy(new Bus(),{
    get(target,key){
        return target[key];
    },
    set(target, key, value){
        if(key == "Message"){
            target.emit(value.to,value);
        }
        target[key] = value;
        return true;
    },
    deleteProperty(target,key){
        delete target[key];
        return true;
    }
});

class Signal{
    constructor(){
        Channel.listen("Signal",this.post);
    }
    post(msg){
        console.log(JSON.stringify(msg)+"被发送到服务器");
    }
}
class Controller extends Bus{
    constructor(){
        super();
        this.container=$("body")[0];
        Channel.listen("Controller",msg=>{
            console.log(JSON.stringify(msg)+"被拦截");
            this.emit(msg.id,msg);
        });
    }
}

function deepProxy(object, handler){
    if(isComplexObject(object)) {
        addProxy(object, handler);
    }
    return new Proxy(object, handler);
}

function addProxy(obj, handler) {
    for (let i in obj) {
        if (typeof obj[i] === 'object') {
            if (isComplexObject(obj[i])) {
                addProxy(obj[i], handler);
            }
            obj[i] = new Proxy(obj[i], handler);
        }
    }
}

function isComplexObject(object) {
    if (typeof object !== 'object') {
        return false;
    } else {
        for (let prop in object) {
            if (typeof object[prop] == 'object') {
                return true;
            }
        }
    }
    return false;
}

class Element extends Bus{
    constructor(fragment,data={}){
        super();
        if(typeof(fragment) == 'string'){
            if(fragment[0] == '#'){
                this.root = $(fragment)[0];
                console.log(this.root)
            }else{
                let doc = new DOMParser().parseFromString(fragment, 'text/html');
                this.root = doc.body.firstChild;
            }
        }else{
            this.root = fragment;
        }
        const that = this;
        this.data = deepProxy(data,{
            set(target,key,value){
                target[key]=value;
                that.emit(key,value);
                return true;
            }
        });
        this.$handle(this.root);
        this.bind(this.root);
        return new Proxy(this,{
            get(target,key){
                if(target.hasOwnProperty(key)){
                    return target[key];
                }else{
                    return target.data[key];
                }
            },
            set(target,key,value){
                if(target.hasOwnProperty(key)){
                    target[key] = value;
                }else{
                    target.data[key] = value;
                }
                return true;
            }
        });
    }
    bind(node){
        if(node!=null&&node.childNodes != null){
            [...node.childNodes].forEach(child =>{
                if(child.nodeType === 1){
                    this.$nodeHandle(child);
                    this.bind(child);
                }else{
                    console.log(child.data)
                    this.$textHandle(child);
                }
            });
        }
    }
    $nodeHandle(node){
        let attributes = node.attributes;
        let keys = Object.values(attributes);
        let id = GenNonDuplicateID();
        keys.forEach(item=>{
            let key = item.localName.match(/^:\w*/g);
            if(key){
                key = key[0].replace(":","");
                let args;
                if(item.value === undefined){
                    return;
                }else{
                    args = item.value.match(/\b\w+\b/g);
                }
                switch(key){
                    case "for":
                        let arg = args[0];
                        let str = "";
                        if(arg === undefined||this.data[arg] === undefined){
                        }else{
                            let obj = this.data[arg];
                            let tag = node.tagName;
                            if(!Array.isArray(obj)){
                                obj = Object.values(obj);
                            }
                            str = `<${tag}>${this.data[arg].join(`</${tag}><${tag}>`)}</${tag}>`;
                        }
                        let parent = node.parentNode;
                        node.parentNode.innerHTML = str;
                        this.bind(parent);
                        break;
                    case "show":
                        args.forEach(arg=>{
                            node.hidden = !this.data[arg];
                            this.listen(arg,(msg=false)=>{
                                node.hidden = !msg;
                            });
                        });
                        break;
                    case "":
                    case "model":
                        switch(node.tagName){
                            case "INPUT":
                                args.forEach(arg=>{
                                    node.value = this.data[arg];
                                    this.listen(arg,msg=>{
                                        node.value=msg;
                                    });
                                });
                                node.oninput = ()=>{
                                    this.emit(id,node.value);
                                }
                                break;
                            case "SELECT":
                                node.onchange = ()=>{
                                    let opts = node.selectedOptions;
                                    let rst = [];
                                    Object.values(opts).forEach(v=>{
                                        rst.push(v.value);
                                    });
                                    this.emit(id,rst);
                                }
                                break;
                            default:
                                return;
                        }
                        this.listen(id,msg=>{
                            args.forEach(arg=>{
                                this.data[arg]=msg;
                            });
                        });      
                        break;
                    default:
                        args.forEach(arg=>{
                            if(arg ==undefined){
                                return;
                            }else if(typeof(this.data[arg])=='function'){
                                node.addEventListener(key,this.data[arg]);
                                this.listen(arg,msg=>{
                                    node.removeEventListener(key,this.data[arg]);
                                    node.addEventListener(key,msg);
                                });
                            }else{
                                node.setAttribute(key,this.data[arg]);
                                this.listen(arg,msg=>{
                                    node.setAttribute(key,msg);
                                });
                            }
                        });
                        break;
                }
            }
        })
    }
    $textHandle(node){
        if(node.data){
            let sentence = node.data;
            let list = sentence.match(/\{[^\}]+\}/g);
            let id = GenNonDuplicateID();
            this.listen(id,msg=>{
                node.data = msg;
            });
            const Cacular = (code,data)=>{
                let keys = Object.keys(data);
                let rst;
                try{
                    eval(`
                        let { ${keys.join(',')} } = data;
                        rst =  ${code};
                    `);
                }catch(error){
                    console.log(error)
                }
                return rst;
            };
            if(list != null){
                let change = ()=>{
                    let rst = sentence;
                    list.forEach(item=>{
                        let code = item.substring(1,item.length-1)
                        rst = rst.replace(item,Cacular(code,this.data));
                    });
                    this.emit(id,rst);
                }
                list.forEach(item=>{
                    let keys = item.match(/[^\d\W][\w\.]+/g);
                    if(keys != null){
                        keys.forEach(key=>{
                            key = key.match(/[^\d\W]\w+$/g);
                            this.listen(key[0],()=>{
                                change();
                            });
                        });
                    }
                });
                change();
            }
        }
    }
    $handle(node){
        if(node.nodeType === 1){
            this.$nodeHandle(node);
        }else{
            this.$textHandle(node);
        }
    }
}

const ele = new Element(`
    <div id='123123' :show="b c">
        <div id="bbb" :model="a">
            aaaaa<p :="aaaa">{text},{abc.ehi},{def}</p>
        </div>
        <input :="text text2" value="aaaaaaa"/>
        <div :click="func2, func ">bbbbb</div>
        <select :="sel" size="2" style="width:200px;height:200px;" multiple>
            <option :for="rt"></option>
        </select>
    </div>
`,{
    b:false,
    aaaa:"212312",
    text:"12345",
    text2:"123456",
    look:list=>{
        return `<option>${list.join("</option><option>")}</option>`;
    },
    c:true,
    sel:[],
    rt:[1,2,3,4,"{text}",6,7,8],
    def:10,
    abc:{
        def:1,
        ehi:2
    },
    func:()=>{
        alert("哈哈哈");
    },
    func2:()=>{
        console.log("bbbb")
    }
});
test.append(ele.root);

ele.func = ()=>{
    console.log("aaaaa");
}

class Frame extends Bus{
    constructor(){
        super();
        this.zindex = 100;
        this.id = GenNonDuplicateID();
        this.parent = null;
        this.x = null;
        this.y = null;
        this.width = null;
        this.height = null;
        this.minsize = {
            width:null,
            height:null
        };
        this.maxsize = {
            width:null,
            height:null
        };
        this.kill = false;
        this.visible = false;
        this.resize = true;
        this.mode = 0;
        this.head = ``;
        this.body = ``;
        this.foot = ``;
        this.reset();
        return new Proxy(this,{
            set(target, key, value){
                target[key] = value;
                target.$ref(key,value);
                target.ref(key,value);
                return true;
            }
        });
    }
    init(){ }
    reset(){
        this.init();
        this.container = $(`
        <div id="${this.id}" class="mWins taskBox" style="position:fixed;z-index: ${this.zindex++};">
            <div style="display: flex;flex-direction: column;align-items: stretch;">
                <div id="${this.id}_head" class="head" style="border-radius: 10px 0 0 0;border: 1px solid black;">
                    <b id="${this.id}_x" class="end" style="float: right;border-radius: 5px;width: 22px;height: 22px;text-align: center;color:black;">×</b>
                    <b id="${this.id}_title"></b>
                </div>
                <div class="body" style="width: 554px;height: 300px;border-left: 1px solid black;border-right: 1px solid black;display: flex;flex-direction: row;align-items: stretch;">
                    <div style="height:100%;display:flex;flex-direction:column;align-items: stretch;"> 
                        <select id="${this.id}_lst"></select>
                        <button id="${this.id}_change" style="width:100%;height:8%">切换视图</button>
                        <button id="${this.id}_kill" style="width:100%;height:8%">结束全部</button>
                    </div>
                    <div style="display:flex;width:100%;height:100%;border-bottom: 1px solid black; flex-direction: column;align-items: stretch;">
                    <div class="scrollView" style="display:flex;width:100%;height:140px;border-bottom: 1px solid black;flex-direction: row;align-items: stretch;">
                        <div style="width:68%;display:flex;flex-direction: column;align-items: stretch;">
                            <div id="${this.id}_view" style="display:flex;flex-direction: column;align-items: stretch;">
                            </div>
                            <div style="display:flex;flex-direction: row;align-items: center;justify-content: center;margin-top:5px;">
                                <button id="${this.id}_kill_pgs" style="margin-right:30px">结束本任务</button>
                                <button id="${this.id}_kill_Thr">结束子线程</button>
                            </div>
                        </div>
                        <select id="${this.id}_sun" size="2" class="scrollView" style="width:32%;" multiple>
                            <option disabled>任务子线程</option>

                        </select>
                    </div>
                        <canvas id="${this.id}_flux" width="370" height="75" style="width:99.2%;height:72px;border-bottom: 1px solid black;"></canvas>
                        <div id="${this.id}_all" class="scrollView" style="display:flex;width:423px;flex:1;flex-direction: column;align-items: stretch;">
                            <b id="${this.id}_rsv"></b>
                            <b id="${this.id}_avg"></b>
                            <b id="${this.id}_tsk_act"></b>
                            <b id="${this.id}_thr_act"></b>
                        </div>
                    </div>
                </div>
                <div class="foot" style="border-radius: 0 0 10px 0;border: 1px solid black;border-top: 0px;">
                    <button id="${this.id}_cal" style="float:right;">关闭</button>
                    <b id="${this.id}_inf"></b>
                </div>
            </div>
        </div>
        `)[0];
    }
    $ref(key, value){
        // console.log(key);
        switch(key){
            case "x":
                break;
            case "y":
                break;
            case "width":
                break;
            case "height":
                break;
            case "visible":
                this.visibleCb(value);
                break;
            case "kill":
                break;
        }
    }
    ref(key,value){

    }
    post(msg){
        Channel.post(msg);
    }
    handle(msg){
        console.log(JSON.stringify(msg)+"被渲染");
    }
    visibleCb(value){
        let parent = this.parent || $("body")[0];
        if(parent){
            if(value){
                parent.append(this.container);
            }else{
                $(`#${this.id}`).remove();
            }
        }
    }
    killCb(value){

    }
}

class Toast extends Frame{
    constructor(){
        super();
        return new Proxy(this,{
            set(target, key, value){
                target[key] = value;
                // console.log(key+":"+value);
                return true;
            }
        });
    }
    ref(key, value){
        // console.log("this is ref");
    }
}