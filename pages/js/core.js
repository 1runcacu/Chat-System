
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
            if(obj[i] === null || obj[i] === undefined){

            }else{
                obj[i] = new Proxy(obj[i], handler);
            }
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
                if(Array.isArray(target)){
                    that.emit("array",value);
                }else{
                    that.emit(key,value);
                }
                return true;
            }
        });
        this.$handle(this.root);
        this.bind(this.root);
        return new Proxy(this,{
            get(target,key){
                switch(key){
                    case "emit":
                    case "listen":
                    case "off":
                        return target[key];
                }
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
                        if(arg === undefined){
                            return;
                        }
                        const model = node.innerHTML;
                        let renderList = ()=>{
                            let str = "";
                            const Cacular = (code,data,item,index)=>{
                                let keys = Object.keys(data);
                                let rst;
                                try{
                                    eval(`
                                        let { ${keys.join(',')} } = data;
                                        rst =  ${code};
                                    `);
                                }catch(error){
                                    console.log(error)
                                    rst="";
                                }
                                return rst;
                            };
                            const make=(sentence,item,index)=>{
                                let list = sentence.match(/\{\{[^\}]+\}\}/g);
                                let rst = sentence;
                                if(list != null){
                                    list.forEach(child=>{
                                        let code = child.substring(2,child.length-2)
                                        rst = rst.replace(child,Cacular(code,this.data,item,index));
                                    });
                                }
                                return rst;
                            }
                            if(this.data[arg] === undefined){
                            }else{
                                let obj = this.data[arg];
                                if(!Array.isArray(obj)){
                                    obj = Object.values(obj);
                                }
                                let html = "";
                                obj.forEach((item,index)=>{
                                    html+=make(model,item,index);
                                });
                                str = html;
                            }
                            node.innerHTML = str;
                            this.bind(node);
                        }
                        renderList();
                        this.listen(arg,renderList);
                        this.listen("array",renderList);
                        return;
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
            let key2 = item.localName.match(/^@\w+/g);
            if(key2){
                key2 = key2[0].replace("@","");
                if(item.value === undefined){
                    return;
                }
                let sentence = item.value;
                let list = sentence.match(/\{[^\}]+\}/g);
                let id = GenNonDuplicateID();
                const Cacular = (code,data)=>{
                    let keys = Object.keys(data);
                    let rst = "";
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
                let value = node.getAttribute(key2) || "";
                if(list != null){
                    this.listen(id,msg=>{
                        node.setAttribute(key2,value+msg);
                    });
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
        })
    }
    $textHandle(node){
        if(node.data){
            let sentence = node.data;
            let list = sentence.match(/\{[^\}]+\}/g);
            let id = GenNonDuplicateID();
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
                this.listen(id,msg=>{
                    node.data = msg;
                });
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

// const ele = new Element(`
//     <div id='123123' :show="b c">
//         <div id="bbb" :model="a" @style="width:{width}px;background:{col};" style="height:100px;">
//             aaaaa<p :="aaaa">{text},{abc.ehi},{def}</p>
//         </div>
//         <input :="text text2" value="aaaaaaa"/>
//         <div :click="func2, func ">bbbbb</div>
//         <select :="sel" size="2" :for="rt" style="width:200px;height:200px;" multiple>
//             <option>aa{{index}}--{{item}}-{text}</option>
//         </select>
//     </div>
// `,{
//     b:false,
//     aaaa:"212312",
//     text:"12345",
//     text2:"123456",
//     c:true,
//     width:20,
//     sel:[],
//     rt:[1,2,3,4,"{text}",6,7,8],
//     def:10,
//     col:"#020202",
//     abc:{
//         def:1,
//         ehi:2
//     },
//     func:()=>{
//         alert("哈哈哈");
//     },
//     func2:()=>{
//         console.log("bbbb")
//     }
// });
// test.append(ele.root);

// ele.func = ()=>{
//     console.log("aaaaa");
// }

class Frame extends Bus{
    constructor(){
        super();
        this.zindex = 100;
        this.id = GenNonDuplicateID();
        this.parent = null;
        this.width = 400;
        this.height = 300;
        this.left = null;
        this.top = null;
        this.minsize = {
            width:400,
            height:300
        };
        this.maxsize = {
            width:window.screen.width,
            height:window.screen.height
        };
        this.$maxsize = {
            width:window.screen.width,
            height:window.screen.height
        };
        this.kill = false;
        this.visible = false;
        this.resize = true;
        this.moveable = true;
        this.title = "";
        this.lineWidth = 10;
        this.direction = "column";
        this.exit = e=>{
            this.$data.visible = false;
            console.log("关掉啦")
        }
        this.reset();
        this.$data =  new Proxy(this,{
            set(target, key, value){
                target[key] = value;
                target.$ref(key,value);
                target.ref(key,value);
                return true;
            }
        });
        return this.$data;
    }
    cursor(icon){
        if(this.parent != null){
            this.parent.style.cursor = icon;
        }else{
            this.container.style.cursor = icon;
        }
    }
    $init(){
        let [SW,SH] = [document.body.clientWidth,document.body.clientHeight];
        this.left = (SW - this.width)/2;
        this.top = (SH - this.height)/2;
        this.head = `
            <div id="${this.id}_head" class="head" style="border-radius: 10px 0 0 0;border: 1px solid black;width:100%;">
                <b id="${this.id}_x" :click="exit" class="end" style="float: right;border-radius: 8px;width: 22px;height: 22px;text-align: center;">×</b>
                <b id="${this.id}_a" :click="exit" class="end" style="float: right;border-radius: 8px;width: 22px;height: 22px;text-align: center;">◻</b>
                <b id="${this.id}_b" :click="exit" class="end" style="float: right;border-radius: 8px;width: 22px;height: 22px;text-align: center;">–</b>
                <b id="${this.id}_title" style="margin-left:10px;">{title}</b>
            </div>
        `;
        this.body = `
            <div class="body" style="width: 100%;height: 100%;border-left: 1px solid black;border-right: 1px solid black;display: flex;flex-direction: row;align-items: stretch;">
                <div style="height:100%;display:flex;flex-direction:column;align-items: stretch;"> 
                    <input :="title"/>
                </div>
                <div style="display:flex;width:100%;height:100%;flex-direction: column;align-items: stretch;">

                </div>
            </div>
        `;
        this.foot = `
            <div class="foot" style="border-radius: 0 0 10px 0;border: 1px solid black;border-top: 0px solid black;width:100%;">
                <button id="${this.id}_cal" style="float:right;margin-right:20px;" >输入了个:{title}</button>
                <b id="${this.id}_inf"></b>
            </div>
        `;
        this.init();
    }
    init(){

    }
    reset(){
        this.$init();
        this.html = `
        <div id="${this.id}" class="mWins taskBox" style="position:fixed;z-index: ${this.zindex};" @style="top:{top}px;left:{left}px;width:{width}px;height:{height}px;">
            <div style="display: flex;align-items: stretch;width:100%;height:100%;" @style="flex-direction: {direction};">
                ${this.head}
                ${this.body}
                ${this.foot}
            </div>
        </div>
        `;
        this.node = new Element(this.html,this);
        this.container = this.node.root;
        let container = this.container;
        container.ondragstart = ()=>{
            return false;
        }
        let flag = false;
        let fail = true;
        let vertical = -1,horizontal = -1,move = -1;
        container.onmousemove=e=>{
            let x = e.clientX - container.offsetLeft;
            let y = e.clientY - container.offsetTop;
            if(!flag){
                vertical = -1;horizontal = -1;move = -1;
            }
            if(y<this.lineWidth&&!flag){
                vertical = 0;
            }else if(y>this.height - this.lineWidth&&!flag){
                vertical = 1;
            }
            if(x<this.lineWidth&&!flag){
                horizontal = 0;
            }else if(x>this.width - this.lineWidth&&!flag){
                horizontal = 1;
            }
            if(!this.resize){
                horizontal = -1;
                vertical = -1;
            }
            switch(`${horizontal}${vertical}`){
                default:
                    this.cursor("default");
                    break;
                case "0-1":
                    this.cursor("w-resize");
                    break;
                case "1-1":
                    this.cursor("e-resize");
                    break;
                case "-10":
                    this.cursor("n-resize");
                    break;
                case "-11":
                    this.cursor("s-resize");
                    break;
                case "00":
                    this.cursor("nw-resize");
                    break;
                case "01":
                    this.cursor("sw-resize");
                    break;
                case "10":
                    this.cursor("sw-resize");
                    break;
                case "11":
                    this.cursor("se-resize");
                    break;
            }
            if(x>this.lineWidth&&x<this.lineWidth+this.width&&y>this.lineWidth&&y<2*this.lineWidth&&!flag){
                if(this.moveable){
                    move = 1;
                    this.cursor("move");
                }else{
                    this.cursor("default");
                    move = -1;
                }
            }
            if(vertical!=-1||horizontal!=-1||move!=-1){
                container.onmousedown=e=>{
                    fail = false;
                    let sitX=e.clientX,sitY=e.clientY;
                    let disX = sitX - container.offsetLeft;
                    let disY = sitY - container.offsetTop;
                    flag = true;
                    let ol=this.left,ot=this.top,ow=this.width,oh=this.height,lw=ow,lh=oh;
                    document.onmousemove = e=>{
                        let tX = e.clientX - disX;
                        let tY = e.clientY - disY;
                        if(flag&fail){
                            this.cursor("default");
                        }
                        if(move == 1){
                            if (tX >= 0 && tX <= window.innerWidth - container.offsetWidth-3.3) {
                            
                            }else{
                                if(tX<0){
                                    tX = 0;
                                }else{
                                    tX = window.innerWidth - container.offsetWidth-3.3;
                                }
                            }
                            if (tY >= 0 && tY <= window.innerHeight - container.offsetHeight-3.3) {

                            }else{
                                if(tY<0){
                                    tY = 0;
                                }else{
                                    tY = window.innerHeight - container.offsetHeight-3.3;
                                }
                            }
                            this.$data.left = tX;
                            this.$data.top = tY;
                        }else{
                            if(horizontal == 1){
                                tX += ow;
                            }
                            if(vertical == 1){
                                tY += oh;
                            }
                            if(tX<0){
                                tX = 0;
                            }
                            if(tX>window.innerWidth-3.3){
                                tX = window.innerWidth-3.3;
                            }
                            if(tY<0){
                                tY = 0;
                            }
                            if(tY>window.innerHeight-3.3){
                                tY = window.innerHeight-3.3;
                            }
                            let dx = sitX-tX;
                            let dy = sitY-tY;
                            switch(horizontal){
                                case 0:
                                    this.$data.width = ow+dx;
                                    this.$data.left = ol-dx;
                                    break;
                                case 1:
                                    this.$data.width = ow-dx;
                                    break;
                            }
                            switch(vertical){
                                case 0:
                                    this.$data.height = oh+dy;
                                    this.$data.top = ot-dy;
                                    break;
                                case 1:
                                    this.$data.height = oh-dy;
                                    break;
                            }
                        }
                    }
                }
            }else{
                container.onmousedown=e=>{
                    flag = true;
                }
                container.onmouseup=e=>{
                    flag = false;
                }
            }
            document.onmouseup = e=>{
                container.onmousedown = null;
                document.onmousemove = null;
                document.onmouseup = null;
                this.cursor("default");
                flag = false;
                fail = true;
            }
        }
        container.onmouseleave=e=>{
            if(!flag){
                this.cursor("default");
            }
        }
    }
    $ref(key, value){
        switch(key){
            case "left":
                if(value<0){
                    this.left=0;
                }
                if(value+this.width>window.innerWidth){
                    this.left = window.innerWidth - this.width -3.3;
                }
                break;
            case "top":
                if(value<0){
                    this.top=0;
                }
                if(value+this.height>window.innerHeight){
                    this.top = window.innerHeight - this.height -3.3;
                }
                break;
            case "width":
            case "height":
                if(this.minsize[key] == null){
                    this.minsize[key] = 0;
                }
                if(this.maxsize[key] == null){
                    this.maxsize[key] = this.$maxsize[key];
                }
                if(value<this.minsize[key]){
                    value = this[key] = this.minsize[key];
                }
                if(value>this.maxsize[key]){
                    value = this[key] = this.maxsize[key];
                }
                break;
            case "visible":
                this.visibleCb(value);
                break;
            case "kill":
                break;
        }
        this.node.emit(key,value);
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
