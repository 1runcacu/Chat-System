let lastTime=null;
let countT=0;
let allT=0;
let countSpeed=0,SpeedBuf=[];
let ThreadNum=0,FnsThreadNum=0;
let TaskNum=0,FnsTaskNum=0;
let Build={
    Task_Progress:{},
    Thread_manager:new Proxy({},{
        get(target,key){
            if(key=="args"){
                return target;
            }else{
                countT++;
                allT++;
                if(lastTime!=null){
                    let thisTime=new Date().getTime();
                    let dt=(thisTime-lastTime)/1000;
                    if(dt>0.4){
                        countSpeed=countT/dt;
                        countT=0;
                        // console.log(countSpeed);
                        lastTime=thisTime;
                        SpeedBuf.push(countSpeed);
                        SpeedBuf=SpeedBuf.slice(-40);
                        // graph.setTaskBuf();
                        wins.threadInter.graph;
                    }
                }else{
                    lastTime = new Date().getTime();
                }
            }
            return target[key];
        },
        set(target, key, value){
            target[key] = value;
            // console.log("监听到线程创建");
            ThreadSum();
            return true;
        },
        deleteProperty(target,key){
            FnsThreadNum++;
            let tidx = target[key].pids.indexOf(key);
            target[key].pids.splice(tidx,1);
            delete target[key];
            // console.log("监听到线程注销");
            ThreadSum();
            return true;
        }
    }),
    Projects:[],
    Setting:{
        renderDelay:1,
        DistributedDelay:1
    },
    ThreadSum:0
};
let OPTBuild=Build;

function ThreadSum(){
    let sum=0;
    for(let i in Build.Thread_manager){
        sum++;
    }
    Build.ThreadSum=sum;
    if(sum==0){
        lastTime=null;
        countSpeed=0;
        SpeedBuf.push(countSpeed);
        graph.setTaskBuf();
        wins.threadInter.graph;
    }
    wins.threadInter.sum=sum;
    // wins.threadInter.sum
    // $("#CPU")[0].innerHTML=`线程数:${sum}个`;
}

function GenNonDuplicateID(randomLength=9){
    let idStr = Date.now().toString(36)
    idStr += Math.random().toString(36).substr(3,randomLength)
    return idStr;
}

//-------------------------------------------------------------------------------------------------异步线程
function Thread(code,callback=()=>{},pid){
    let rsv,rjt;
    let Tid=GenNonDuplicateID();
    let id;
    if(pid!=undefined){
        id=progress_manager.getTid(pid);
        id.push(Tid);
    }
    ThreadNum++;
    let url=URL.createObjectURL(new Blob([`(${code.toString()})()`]));
    let worker = new Worker(
        url
    );
    Build.Thread_manager[Tid]={
        flag:true,
        pids:id,
        Tid:pid,
        time:new Date().toJSON(),
        count:0
    };
    worker.onmessage=({data:{Pack,flag}})=>{
        let stopflag=false;
        if(!Build.Thread_manager[Tid]||!Build.Thread_manager[Tid].flag){
            stopflag=true;
        }
        if(stopflag||flag){
            URL.revokeObjectURL(url);
            worker.postMessage({cmd:0});
            worker.terminate();
            worker=null;
            delete Build.Thread_manager[Tid];
            if(stopflag){
                if(pid!=undefined){
                    progress_manager.finishProgress(pid);
                }
                rjt();
            }else{
                rsv(Pack);
            }
        }else{
            callback(Pack);
        }
    }
    return (Pack,fail=()=>{})=>
        new Promise(resolve=>{
            rsv=resolve;
            rjt=fail;
            try{
                worker.postMessage({Pack,cmd:1});
            }catch(error){
                console.log(error);
                worker.postMessage({Pack:DeepCLone(Pack),cmd:1});
            }
        });
}
function KillThread(id){
    if(Build.Thread_manager[id]){
        Build.Thread_manager[id].flag=false;
    }
}
function KillSomeThread(ids=[]){
    ids.map(id=>{
        KillThread(id);
    });
}
function KillAllThread(){
    // app.resetSYS();
    for(let id in Build.Thread_manager){
        KillThread(id);
    }
    // savekeyS=true;
    // layer_manager.runflag=false;
}
function DistributedThread(code,callback=()=>{},N=5,pid){
    N=parseInt(N)
    let rsv;
    let url=URL.createObjectURL(new Blob([`(${code.toString()})()`]));
    let threadL={};
    let id;
    let pgs_args={},pgs_flag=false,delay=0;
    if(pid!=undefined){
        id=progress_manager.getTid(pid)||[];
    }
    let M=N;
    ThreadNum+=M;
    function runCheck(){
        let s=0;
        for(let i in threadL){
            s++;
        }
        if(s==0){
            rsv();
        }
    }
    for(let i=0;i<N;i++){
        let Tid=GenNonDuplicateID();
        id.push(Tid);
        Build.Thread_manager[Tid]={
            flag:true,
            pids:id,
            Tid:pid,
            time:new Date().toJSON(),
            count:0
        };
        let worker = new Worker(url);
        worker.onmessage=({data:{Pack,flag,id}})=>{
            let stopflag=false;
            if(!Build.Thread_manager[Tid]||!Build.Thread_manager[Tid].flag){
                stopflag=true;
            }
            if(stopflag||flag){
                if(pgs_flag){
                    // delete pgs_args[id];
                    let sz=pgs_args[id].size;
                    pgs_args[id].count=sz;
                }
                URL.revokeObjectURL(url);
                worker.postMessage({cmd:0});
                worker.terminate();
                worker=null;
                delete Build.Thread_manager[id];
                delete threadL[id];
                M--;
                runCheck();
            }else{
                worker.postMessage({mdl:delay*M/N,cmd:1});
                if(pgs_flag){
                    let nb=pgs_args[id].count,sz=pgs_args[id].size;
                    pgs_args[id].count=(++nb>sz)?sz:nb;
                }
                callback(Pack,id);
            }
        }
        threadL[Tid]={
            worker,
            id:Tid
        };
    }
    return (PackList,union,args={},key,PN=1)=>
        new Promise(resolve=>{
            rsv=resolve;
            delay=union.delay||0;
            if(key){
                pgs_flag=true;
                pgs_args=args;
            }
            for(let WK in threadL){
                let Pack=PackList.splice(0,1);
                if(Pack.length>0){
                    try{
                        threadL[WK].worker.postMessage({Pack:Pack[0],union,cmd:1,id:threadL[WK].id});
                    }catch(error){
                        console.log(error);
                        threadL[WK].worker.postMessage({Pack:DeepCLone(Pack[0]),union:DeepCLone(union),cmd:1,id:threadL[WK].id});
                    }
                    if(pgs_flag){
                        args[threadL[WK].id]={
                            count:0,
                            size:Pack[0][key]*PN
                            // size:Pack[0][key].length*PN
                        };
                    }
                }else{
                    threadL[WK].worker.postMessage({cmd:0,id:threadL[WK].id});
                    if(pgs_flag){
                        args[threadL[WK].id]={
                            count:0,
                            size:0
                        };
                    }
                }
            }
        });
}

class Graph{
    constructor(){
        this.buf=$(`<canvas width="${424}" height="${74}" style="background-color: ${"rgba(255,255,255,0.4)"};"></canvas>`)[0];
        this.buf2=$(`<canvas width="400" height="400" style="width:150px;height:150px;background-color:rgba(255,255,255,0);"></canvas>`)[0];
        this.ctx=this.buf.getContext("2d");
        this.ctx.translate(40,70);
        this.ctx.scale(1,-1);
        this.fillstyle="rgb(0,0,0)";
        this.strokeStyle="rgb(0,0,0)";
        this.ctx2=this.buf2.getContext("2d");
        this.setTaskBuf();
    }
    curve(id,Scatter=[],[xmin,xmax,ymin,ymax]=[-10,10,-10,10],[rx,ry,rX,rY],callback=(v)=>{return v;},n=10){
        let cvs=$(`#${id}`)[0];
        let ctx=cvs.getContext("2d");
        this.clear(id);
        ctx.save();
        ctx.translate(cvs.width/2,cvs.height/2);
        let [Xm,XM,Ym,YM]=[-0.4*cvs.width,0.4*cvs.width,-0.4*cvs.height,0.4*cvs.height];
        // ctx.scale(1,-1);
        let kx=(XM-Xm)/(xmax-xmin),ky=(YM-Ym)/(ymax-ymin);
        function transP([x,y]){
            return [parseInt(kx*(x-xmin)+Xm),parseInt(YM-ky*(y-ymin))];
        }
        let [nxm,nxM,nym,nyM]=[Infinity,-Infinity,Infinity,-Infinity];
        ctx.font = "18px bold 黑体";
        ctx.fillStyle = "rgb(0,0,0)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle=this.strokeStyle;
        
        ctx.beginPath();
        ctx.setLineDash([13]);
        ctx.lineWidth=1;
        for(let i=0,dx=(XM-Xm)/10,dy=(YM-Ym)/10,x=Xm,y=Ym;i<11;i++,x+=dx,y+=dy){
            ctx.setLineDash([8,8]);
            ctx.moveTo(x,Ym);
            ctx.lineTo(x,YM);
            ctx.moveTo(Xm,y);
            ctx.lineTo(XM,y);
        }
        ctx.stroke();
        ctx.lineWidth=3;
        if(rx&&ry&&rX&&rY){
            ctx.beginPath();
            let [Rx,Ry]=transP([rx,ry]);
            let [RX,RY]=transP([rX,rY]);
            ctx.strokeStyle="rgb(50,0,200)";
            ctx.rect(Rx,Ry,RX-Rx,RY-Ry);
            ctx.stroke();
        }
        ctx.strokeStyle=this.strokeStyle;
        let [xs,ys]=transP([0,0]);
        ctx.beginPath();
        // ctx.lineWidth=3;
        ctx.setLineDash([]);
        ctx.moveTo(Xm,ys);
        ctx.lineTo(XM,ys);
        ctx.moveTo(xs,Ym);
        ctx.lineTo(xs,YM);
        ctx.stroke();
        ctx.fillText("X",XM+18,ys);
        ctx.fillText("Z",xs,Ym-18);
        ctx.fillText(xmin,Xm,YM+18);
        ctx.fillText(xmax,XM,YM+18);
        ctx.fillText(ymin,Xm-28,YM);
        ctx.fillText(ymax,Xm-28,Ym);
        ctx.beginPath();
        ctx.fillStyle = "rgb(255,0,200)";
        Scatter.map((v,i)=>{
            nxm=(nxm>v[0])?v[0]:nxm;
            nym=(nym>v[2])?v[2]:nym;
            nxM=(nxM<v[0])?v[0]:nxM;
            nyM=(nyM<v[2])?v[2]:nyM;
            v=transP([v[0],v[2]]);
            ctx.fillRect(v[0]-4,v[1]-4,8,8);
        });
        callback(Scatter,n).map((v,i)=>{
            v=transP([v[0],v[2]]);
            if(i==0){
                ctx.moveTo(v[0],v[1]);
                return;
            }
            ctx.lineTo(v[0],v[1]);
        });
        ctx.stroke();
        ctx.restore();
        xmin=(xmin<nxm)?xmin:nxm;
        xmax=(xmax>nxM)?xmax:nxM;
        ymin=(ymin<nym)?ymin:nym;
        ymax=(ymax>nyM)?ymax:nyM;
        return [[xmin,xmax],[ymin,ymax]]
    }
    setBodyaxis(){
        const ctx=this.ctx2;
        ctx.save();
        ctx.clearRect(0,0,400,400);
        ctx.translate(200,200);
        let [Xm,XM,Ym,YM]=[-160,160,-160,160];
        ctx.font = "20px bold 黑体";
        ctx.fillStyle = "rgb(0,0,0)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle="rgb(0,0,0)";
        ctx.lineWidth=2;
        ctx.setLineDash([8]);
        ctx.beginPath();
        ctx.moveTo(Xm,0);
        ctx.lineTo(XM,0);
        ctx.moveTo(0,Ym);
        ctx.lineTo(0,YM);
        ctx.stroke();
        ctx.fillText("X",XM+18,0);
        ctx.fillText("Z",0,Ym-18);
        ctx.fillText("Y",0,0);
        let axis={
            P:OPTBuild.Project.globle_camera.IP
        };
        let [k,d,D]=[160,6,2]
        const scale=(v,k=1)=>{
            return [v[0]*k,v[1]*k,v[2]*k];
        }
        const add=(v1,v2)=>{
            return [v1[0]+v2[0],v1[1]+v2[1],v1[2]+v2[2]];
        }
        let ps=[
            [0,0,0],
            [axis.P[0],axis.P[1],axis.P[2]],
            [axis.P[4],axis.P[5],axis.P[6]],
            [axis.P[8],axis.P[9],axis.P[10]],
            [axis.P[0]*1.25,axis.P[1]*1.25,axis.P[2]*1.25],
            [axis.P[4]*1.25,axis.P[5]*1.25,axis.P[6]*1.25],
            [axis.P[8]*1.25,axis.P[9]*1.25,axis.P[10]*1.25],
        ];
        let y1=[...ps[2]],y2=scale(ps[2],0.82);
        let x1=scale(ps[1],0.04),x2=scale(ps[1],-0.04);
        let z1=scale(ps[3],0.04),z2=scale(ps[3],-0.04);
        ps.push(y1,add(y2,x1),add(y2,x2),add(y2,z1),add(y2,z2));
            x1=[...ps[1]],x2=scale(ps[1],0.82);
            y1=scale(ps[2],0.04),y2=scale(ps[2],-0.04);
        ps.push(x1,add(x2,y1),add(x2,y2),add(x2,z1),add(x2,z2));
            z1=[...ps[3]],z2=scale(ps[3],0.82);
            x1=scale(ps[1],0.04),x2=scale(ps[1],-0.04);
        ps.push(z1,add(z2,x1),add(z2,x2),add(z2,y1),add(z2,y2));
        let fs=[
            [0,1],
            [12,13],
            [12,14],
            [12,15],
            [12,16],
            [0,2],
            [7,8],
            [7,9],
            [7,10],
            [7,11],
            [0,3],
            [17,18],
            [17,19],
            [17,20],
            [17,21],
        ];
        ps=ps.map(p=>{
            let kp=k/(1.0+(p[1]+D)/d);
            return [kp*p[0],kp*p[2]];
        });
        ctx.lineWidth=4;
        ctx.font = "20pt 黑体";
        ctx.fillStyle = "rgb(255,0,0)";
        ctx.fillText("X",ps[4][0],-ps[4][1]);
        ctx.fillStyle = "rgb(0,180,0)";
        ctx.fillText("Y",ps[5][0],-ps[5][1]);
        ctx.fillStyle = "rgb(0,0,255)";
        ctx.fillText("Z",ps[6][0],-ps[6][1]);
        ctx.scale(1,-1);
        ctx.setLineDash([]);
        fs.map((fs,j)=>{
            ctx.beginPath();
            if(j<5){
                ctx.strokeStyle="rgb(255,0,0)";
            }else if(j<10){
                ctx.strokeStyle="rgb(0,180,0)";
            }else{
                ctx.strokeStyle="rgb(0,0,255)";
            }
            fs.map((f,i)=>{
                if(i==0){
                    ctx.moveTo(...ps[f]);
                }else{
                    ctx.lineTo(...ps[f]);
                }
            });
            ctx.stroke();
        });
        ctx.restore();
    }
    axis(id,[va,vb,vr]=[0,0,0]){
        let cvs=$(`#${id}`)[0];
        let ctx=cvs.getContext("2d");
        this.clear(id);
        ctx.save();
        ctx.translate(cvs.width/2,cvs.height/2);
        let [Xm,XM,Ym,YM]=[-0.4*cvs.width,0.4*cvs.width,-0.4*cvs.height,0.4*cvs.height];
        ctx.font = "18px bold 黑体";
        ctx.fillStyle = "rgb(0,0,0)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle="grey";
        ctx.lineWidth=1;
        ctx.setLineDash([8]);
        ctx.beginPath();
        ctx.moveTo(Xm,0);
        ctx.lineTo(XM,0);
        ctx.moveTo(0,Ym);
        ctx.lineTo(0,YM);
        ctx.stroke();
        ctx.fillText("X",XM+18,0);
        ctx.fillText("Z",0,Ym-18);
        ctx.fillText("Y",0,0);
        let axis=new Transform().rotE(va,vb,vr);
        let [k,d,D]=[160,6,2]
        const scale=(v,k=1)=>{
            return [v[0]*k,v[1]*k,v[2]*k];
        }
        const add=(v1,v2)=>{
            return [v1[0]+v2[0],v1[1]+v2[1],v1[2]+v2[2]];
        }
        let ps=[
            [0,0,0],
            [axis.P[0],axis.P[1],axis.P[2]],
            [axis.P[4],axis.P[5],axis.P[6]],
            [axis.P[8],axis.P[9],axis.P[10]],
            [axis.P[0]*1.25,axis.P[1]*1.25,axis.P[2]*1.25],
            [axis.P[4]*1.25,axis.P[5]*1.25,axis.P[6]*1.25],
            [axis.P[8]*1.25,axis.P[9]*1.25,axis.P[10]*1.25],
        ];
        let y1=[...ps[2]],y2=scale(ps[2],0.82);
        let x1=scale(ps[1],0.04),x2=scale(ps[1],-0.04);
        let z1=scale(ps[3],0.04),z2=scale(ps[3],-0.04);
        ps.push(y1,add(y2,x1),add(y2,x2),add(y2,z1),add(y2,z2));
            x1=[...ps[1]],x2=scale(ps[1],0.82);
            y1=scale(ps[2],0.04),y2=scale(ps[2],-0.04);
        ps.push(x1,add(x2,y1),add(x2,y2),add(x2,z1),add(x2,z2));
            z1=[...ps[3]],z2=scale(ps[3],0.82);
            x1=scale(ps[1],0.04),x2=scale(ps[1],-0.04);
        ps.push(z1,add(z2,x1),add(z2,x2),add(z2,y1),add(z2,y2));
        let fs=[
            [0,1],
            [12,13],
            [12,14],
            [12,15],
            [12,16],
            [0,2],
            [7,8],
            [7,9],
            [7,10],
            [7,11],
            [0,3],
            [17,18],
            [17,19],
            [17,20],
            [17,21],
        ];
        ps=ps.map(p=>{
            let kp=k/(1.0+(p[1]+D)/d);
            return [kp*p[0],kp*p[2]];
        });
        ctx.lineWidth=4;
        ctx.font = "20pt 黑体";
        ctx.fillStyle = "rgb(255,0,0)";
        ctx.fillText("X",ps[4][0],-ps[4][1]);
        ctx.fillStyle = "rgb(0,180,0)";
        ctx.fillText("Y",ps[5][0],-ps[5][1]);
        ctx.fillStyle = "rgb(0,0,255)";
        ctx.fillText("Z",ps[6][0],-ps[6][1]);
        ctx.scale(1,-1);
        ctx.setLineDash([]);
        fs.map((fs,j)=>{
            ctx.beginPath();
            if(j<5){
                ctx.strokeStyle="rgb(255,0,0)";
            }else if(j<10){
                ctx.strokeStyle="rgb(0,180,0)";
            }else{
                ctx.strokeStyle="rgb(0,0,255)";
            }
            fs.map((f,i)=>{
                if(i==0){
                    ctx.moveTo(...ps[f]);
                }else{
                    ctx.lineTo(...ps[f]);
                }
            });
            ctx.stroke();
        });
        ctx.restore();
        return axis.P;
    }
    setTaskBuf(){
        let ctx=this.ctx;
        ctx.clearRect(-40,-4,424,74);
        ctx.strokeStyle=this.strokeStyle;
        ctx.beginPath();
        ctx.lineWidth=1;
        ctx.moveTo(0,0);
        ctx.lineTo(344,0);
        ctx.moveTo(0,0);
        ctx.lineTo(0,60);
        ctx.stroke();
        ctx.setLineDash([4]);
        ctx.beginPath();
        for(let i=1,dx=344/5;i<6;i++){
            ctx.moveTo(dx*i,0);
            ctx.lineTo(dx*i,66);
        }
        for(let i=1,dy=60/3;i<4;i++){
            ctx.moveTo(0,dy*i);
            ctx.lineTo(344,dy*i);
        }
        ctx.stroke();
        let max = 10,last=0;
        let L=SpeedBuf.length;
        SpeedBuf.map(v=>{
            max=(max<v)?v:max;
        });
        if(L){
            last=SpeedBuf[L-1];
        }
        ctx.save()
        ctx.scale(1,-1);
        ctx.font = "10pt 黑体";
        ctx.fillStyle = "rgb(0,0,255)";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.strokeStyle="grey";
        ctx.fillText(Math.round(max),-2,-62);
        ctx.fillText(0,-2,-2);
        ctx.textAlign = "left";
        ctx.fillStyle = "rgb(255,0,0)";
        ctx.fillText(Math.round(last),348,-2-(last*60/max));
        ctx.restore();
        function change(y){
            return parseFloat(y)*60/max;
        }
        ctx.lineWidth=2;
        ctx.strokeStyle="rgb(255,0,0)";
        ctx.setLineDash([]);
        if(L){
            ctx.beginPath();
            ctx.moveTo(344,change(SpeedBuf[L-1]));
            for(let i=L-1,x0=344,dx=344/40;i>-1;i--,x0-=dx){
                ctx.lineTo(x0,change(SpeedBuf[i]));
            }
            ctx.stroke();
            ctx.lineWidth=1;
            ctx.strokeStyle="rgb(0,180,0)";
            ctx.beginPath();
            ctx.moveTo(344,change(SpeedBuf[L-1]));
            ctx.lineTo(0,change(SpeedBuf[L-1]));
            ctx.stroke();

        }
    }
    TaskCurve(id){
        let cvs=$(`#${id}`)[0];
        let ctx=cvs.getContext("2d");
        let {width,height}=cvs;
        ctx.clearRect(0,0,width,height);
        ctx.drawImage(this.buf,0,0,width,height);
    }
    Bodyaxis(id){
        let cvs=$(`#${id}`)[0];
        let ctx=cvs.getContext("2d");
        let {width,height}=cvs;
        ctx.clearRect(0,0,width,height);
        ctx.drawImage(this.buf2,0,0,width,height);
    }
    clear(id){
        let cvs=$(`#${id}`)[0];
        cvs.getContext("2d").clearRect(0,0,cvs.width,cvs.height);
    }
}

const graph = new Graph();


class Progress_manager{
    constructor(){
        this.index=0;
        this.length=0;
    }
    makeId(){
        if(this.length<=0){
            this.index=0;
        }
        return this.index++;
    }
    makeProgress(task="",v=0.0){
        let id=this.makeId();
        this.length++;
        TaskNum++;
        Build.Task_Progress[id]={
            task,
            psc:v,
            Tid:[],
            startArgs:new Date().toJSON(),
            startTime:new Date().getTime(),
            forecast:null,
            speed:0
        };
        // title.innerHTML=task;
        wins.threadInter.sum;
        // $("progress").val(v);
        return id;
    }
    getTid(id){
        return Build.Task_Progress[id].Tid;
    }
    setProgress(id,psc=0.0){
        let pgs=Build.Task_Progress[id];
        pgs.psc=psc;
        let thisTime=new Date().getTime();
        let Dt=(thisTime-pgs.startTime)/1000;
        if(psc>0){
            pgs.forecast=(1-psc)*Dt/psc;
            pgs.speed=psc/Dt;
            // console.log("平均速度:"+pgs.speed,"预计还要:"+pgs.forecast+"s");
            wins.threadInter.pro=id;
        }else{
            pgs.startTime=new Date().getTime();
        }
        // $("progress").val(psc);
    }
    setTask(id,task="未知状态"){
        Build.Task_Progress[id].task=task;
        // title.innerHTML=task;
        wins.threadInter.pro;
    }
    finishProgress(id){
        FnsTaskNum++;
        if(Build.Task_Progress[id]){
            this.length--;
            delete Build.Task_Progress[id];
            wins.threadInter.sum;
        }
        // title.innerHTML="";
        // $("progress").val(0);
    }
}

const progress_manager=new Progress_manager();



class Win_manager{
    constructor(){
        this.box=$("body")[0];
        this.zindex=200;
        this.task={};
        this.axis={};
        const taskRender=(mode=0)=>{
            let initflag=0;
            for(let id in this.task){
                switch(mode){
                    default:
                    case 0:
                        this[id].lst.show;
                        break;
                    case 1:
                        this[id].view.show;
                        break;
                    case 2:
                        this[id].lst.show;
                        this[id].sun.show;
                        break;
                    case 3:
                        this[id].lst.show;
                        this[id].view.show;
                        this[id].sun.show;
                        break;
                    case 4:
                        if(initflag++==0){
                            graph.setTaskBuf();
                        }
                        graph.TaskCurve(`${id}_flux`);
                        break;
                }
                this[id].rsv.CT=allT;
                this[id].avg.CT=countSpeed;
            }
        };
        const axisRender=()=>{
            graph.setBodyaxis();
            for(let id in this.axis){
                this[id].axis.show;
            }
        };
        this.axisInter=new Proxy({},{
            get(target,key){
                axisRender();
                return true;
            }
        });
        this.threadInter=new Proxy({sum:0},{
            get(target,key){
                if(key=="sum"){
                    taskRender(3);
                }else if(key=="pro"){
                    taskRender(1);
                }else if(key=="sun"){
                    taskRender(2);
                }else if(key=="getpro"){
                    return target.pro;
                }else if(key=="getsum"){
                    return target.sum;
                }else if(key=="graph"){
                    taskRender(4);
                }else{
                    taskRender(0);
                }
                return target[key];
            },
            set(target, key, value){
                target[key] = value;
                if(key=="sum"){
                    taskRender(3);
                }else if(key=="pro"){
                    taskRender(1);
                }else if(key=="sun"){
                    taskRender(2);
                }else{
                    taskRender(0);
                }
                // console.log("触发线程管理器渲染");
                return true;
            },
            deleteProperty(target,key){
                delete target[key];
                // console.log(key);
                // console.log("监听到线程注销");
                taskRender(2);
                return true;
            }
        })
    }
    bind(id,key,data,enable=[]){
        data.id=`${id}_${key}`;
        this[id][key]=new Proxy(data,{
            get(target,index){
                if(index=="show"){
                    target.render(target);
                }
                return target[index];
            },
            set(target, key, value){
                target[key] = value;
                if(enable.indexOf(key)!=-1){
                    target.render(target);
                }
                return true;
            }
        });
        this[id][key].show;
    }
    setPosition(id,sit={buttom:200}){
		let ele=$(`#${id}`)[0];
        let {width,height}=ele.getBoundingClientRect();
        let [X,Y]=[window.screen.width,window.screen.height];
        if(sit.bottom){
            ele.style.bottom=sit.bottom+"px";
            sit.top=ele.getBoundingClientRect().top;
            ele.style.bottom=null;
        }
        if(!sit.left){
            if(sit.right){
                ele.style.right=sit.right+"px";
                sit.left=ele.getBoundingClientRect().left;
                ele.style.right=null;
            }else{
                sit.left=(X-width)/2;
            }
        }
        ele.style.left=sit.left+"px";
        ele.style.top=sit.top+"px";
	}
    setMoveable(id,selectid=id){
		let el=$(`#${id}`)[0];
		let selid=$(`#${selectid}`)[0];
		selid.onmousedown=function(e){
            let disX = e.clientX - el.offsetLeft;
            let disY = e.clientY - el.offsetTop;
            document.onmousemove = function (e) {
              let tX = e.clientX - disX;
              let tY = e.clientY - disY;
              if (tX >= 0 && tX <= window.innerWidth - el.offsetWidth) {
                el.style.left = tX + 'px';
              }else{
                  if(tX<0){
                    el.style.left = 0 + 'px';
                  }else{
                    el.style.left = (window.innerWidth - el.offsetWidth) + 'px';
                  }
              }
              if (tY >= 0 && tY <= window.innerHeight - el.offsetHeight) {
                el.style.top = tY + 'px';
              }else{
                if(tY<0){
                    el.style.top = 0 + 'px';
                  }else{
                    el.style.top = (window.innerHeight - el.offsetHeight) + 'px';
                  }
              }
            };
            document.onmouseup = function (e) {
                document.onmousemove = null;
                document.onmouseup = null;
            }
		}
	}
    async Toast(msg="",time=1000,sit={bottom:200}){
        let id=GenNonDuplicateID();
        this.box.append($(`
        <div id="${id}" class="mWins toast" style="position:fixed;z-index:${this.zindex++};border: 1px solid black;border-radius: 5px;width:auto;height:auto;">
            <b id="${id}_msg"></b>
        </div>
        `)[0]);
        this[id]={};
        this.bind(id,"msg",{msg,
            render:(e)=>{
            $(`#${e.id}`)[0].replaceWith($(`<b id="${id}_msg" style="text-align: center; padding: 0px 1px;user-select:none;">${e.msg}</b>`)[0]);
        }},["msg"]);
        this.setPosition(id,sit);
        return await new Promise(resolve=>{
            setTimeout(() => {
                resolve({msg:this[id].msg.msg,event:"sure"});
                this.closeWin(id);
            }, time);
        });
    }
    async msgBox(msg="这是一个消息框",title="消息",sit={bottom:300}){
        let id=GenNonDuplicateID();
        this.box.append($(`
        <div id="${id}" class="mWins" style="position:fixed;z-index:${this.zindex++};">
            <div id="${id}_body">
            </div>
        </div>
        `)[0]);
        this[id]={};
        this.bind(id,"body",{msg,title,render:(e)=>{
            $(`#${e.id}`)[0].replaceWith($(`
            <div id="${id}_body" class="msgBox" style="width: auto;height: auto;display: flex;flex-direction: column;align-items: stretch;border-radius: 10px 10px 0 0;border: 1px solid black;">
                <b class="head" style="padding-left: 10px;border: 1px solid black;border-radius: 10px 10px 0 0;user-select:none;">${e.title}</b>
                <p style="text-align: center; padding: 2px 50px;user-select:none;">${e.msg}</p>
                <button id="${id+"_sure"}" >确定</button>
            </div>
            `)[0]);
        }},["msg","title"]);
        this.setMoveable(id,id);
        this.setPosition(id,sit);
        return await new Promise(resolve=>{
            $(`#${id}_sure`).on("click",()=>{
                resolve({
                    msg:this[id].body.msg,
                    title:this[id].body.title,
                    event:"sure"
                });
                this.closeWin(id);
            })
        });
    }
    async taskBox(sit={bottom:300}){
        let id=GenNonDuplicateID();
        this.task[id]={};
        this.box.append($(`
        <div id="${id}" class="mWins taskBox" style="position:fixed;z-index: ${this.zindex++};">
            <div style="display: flex;flex-direction: column;align-items: stretch;">
                <div id="${id}_head" class="head" style="border-radius: 10px 0 0 0;border: 1px solid black;">
                    <b id="${id}_x" class="end" style="float: right;border-radius: 5px;width: 22px;height: 22px;text-align: center;color:black;">×</b>
                    <b id="${id}_title"></b>
                </div>
                <div class="body" style="width: 554px;height: 300px;border-left: 1px solid black;border-right: 1px solid black;display: flex;flex-direction: row;align-items: stretch;">
                    <div style="height:100%;display:flex;flex-direction:column;align-items: stretch;"> 
                        <select id="${id}_lst"></select>
                        <button id="${id}_change" style="width:100%;height:8%">切换视图</button>
                        <button id="${id}_kill" style="width:100%;height:8%">结束全部</button>
                    </div>
                    <div style="display:flex;width:100%;height:100%;border-bottom: 1px solid black; flex-direction: column;align-items: stretch;">
                    <div class="scrollView" style="display:flex;width:100%;height:140px;border-bottom: 1px solid black;flex-direction: row;align-items: stretch;">
                        <div style="width:68%;display:flex;flex-direction: column;align-items: stretch;">
                            <div id="${id}_view" style="display:flex;flex-direction: column;align-items: stretch;">
                            </div>
                            <div style="display:flex;flex-direction: row;align-items: center;justify-content: center;margin-top:5px;">
                                <button id="${id}_kill_pgs" style="margin-right:30px">结束本任务</button>
                                <button id="${id}_kill_Thr">结束子线程</button>
                            </div>
                        </div>
                        <select id="${id}_sun" size="2" class="scrollView" style="width:32%;" multiple>
                            <option disabled>任务子线程</option>

                        </select>
                    </div>
                        <canvas id="${id}_flux" width="370" height="75" style="width:99.2%;height:72px;border-bottom: 1px solid black;"></canvas>
                        <div id="${id}_all" class="scrollView" style="display:flex;width:423px;flex:1;flex-direction: column;align-items: stretch;">
                            <b id="${id}_rsv"></b>
                            <b id="${id}_avg"></b>
                            <b id="${id}_tsk_act"></b>
                            <b id="${id}_thr_act"></b>
                        </div>
                    </div>
                </div>
                <div class="foot" style="border-radius: 0 0 10px 0;border: 1px solid black;border-top: 0px;">
                    <button id="${id}_cal" style="float:right;">关闭</button>
                    <b id="${id}_inf"></b>
                </div>
            </div>
        </div>
        `)[0]);
        this[id]={};
        this.bind(id,"title",{title:"任务管理器",render:(e)=>{
            $(`#${e.id}`)[0].replaceWith($(`
                <b id="${id}_title" style="margin-left: 10px;float: left;">${e.title}</b>
            `)[0]);
        }},["title"]);
        this.bind(id,"inf",{inf:"",render:(e)=>{
            $(`#${e.id}`)[0].replaceWith($(`
            <b id="${id}_inf" style="float: left;">${e.inf}</b>
            `)[0]);
        }},["inf"]);
        this.bind(id,"rsv",{
            CT:0,
            render:(e)=>{
                $(`#${id}_rsv`)[0].replaceWith($(`
                <b id="${id}_rsv">数据包接收:<u>${e.CT}</u>个</b>
                `)[0]);
            }
        },["CT"]);
        this.bind(id,"avg",{
            render:(e)=>{
                $(`#${id}_avg`)[0].replaceWith($(`
                <b id="${id}_avg">数据包接收:<u>${parseFloat(e.CT).toFixed(2)}</u>个/S</b>
                `)[0]);
            }
        },["CT"]);
        this.bind(id,"tsk_act",{
            N:0,
            render:(e)=>{
                $(`#${id}_tsk_act`)[0].replaceWith($(`
                <b id="${id}_tsk_act">任务统计:当前<u>${e.N}</u> &nbsp 统计:<u>${TaskNum}</u> &nbsp 结束:<u>${FnsTaskNum}</u></b>
                `)[0]);
            }
        },["N"]);
        this.bind(id,"thr_act",{
            N:0,
            render:(e)=>{
                $(`#${id}_thr_act`)[0].replaceWith($(`
                <b id="${id}_thr_act">线程统计:当前<u>${e.N}</u> &nbsp 统计:<u>${ThreadNum}</u> &nbsp 结束:<u>${FnsThreadNum}</u></b>
                `)[0]);
            }
        },["N"]);
        this.bind(id,"lst",{
            N:0,
            M:0,
            tsk:[],
            mode:0,
            render:(e)=>{
                let tsk=[];
                let Tsk=[];
                for(let i in Build.Task_Progress){
                    Tsk.push([i,Build.Task_Progress[i]]);
                }
                e.tsk=Tsk;
                if(e.mode==0){
                    tsk=Tsk;
                }else{
                    let tsks=Build.Thread_manager["args"];
                    for(let i in tsks){
                        tsk.push([i,tsks[i]]);
                    }
                }
                this[id].tsk_act.N=Tsk.length;
                this[id].thr_act.N=this.threadInter["getsum"];
                $(`#${e.id}`)[0].replaceWith($(`
                <div id="${id}_lst" class="list" size="2" style="width:130px; flex-direction: row;align-items: stretch;flex:1">
                    <select id="${id}_list" size="2" class="scrollView" size="2" style="width:100%;height:100%">
                        <option disabled>${(e.mode==0)?"任务列表":"线程列表"}</option>
                        ${
                            (()=>{
                                switch(e.mode){
                                    default:
                                    case 0:
                                        return tsk.map((v,i)=>{
                                            return `<option ${(i==(e.N-1))?"selected":""}>${v[1].task}</option>`
                                        }).join('');
                                    case 1:
                                        return tsk.map((v,i)=>{
                                            return `<option ${(i==(e.M-1))?"selected":""}>${v[0]}</option>`
                                        }).join('');
                                }
                            })()
                        }
                    </select>
                </div>
                `)[0]);
                $(`#${id}_lst`).on("change",()=>{
                    if(e.mode==0){
                        e.N=parseInt($(`#${id}_list`)[0].selectedIndex);
                        this[id].view.show;
                        this[id].sun.show;
                    }else{
                        e.M=parseInt($(`#${id}_list`)[0].selectedIndex);
                        this[id].view.show;
                        this[id].sun.show;
                    }
                });
        }},"mode");
        this.bind(id,"view",{
            render:(e)=>{
                let lst=this[id].lst;
                let N=lst.N;
                let tsk=lst.tsk;
                let data,TID;
                if(N){
                    if(N>tsk.length){
                        N=tsk.length;
                        lst.N=N;
                    }
                }else{
                    if(tsk.length>0){
                        N=1;
                        lst.N=1;
                    }
                }
                if(N){
                    data=tsk[N-1][1];
                    TID=tsk[N-1][0];
                }else{
                    data={
                        task:"-",
                        psc:"-",
                        Tid:[],
                        startArgs:"-",
                        speed:"-",
                        forecast:"-"
                    };
                    TID="-";
                }
                if(tsk.length>0&&`${TID}`!=this.threadInter["getpro"]){
                    return;
                }
                $(`#${e.id}`)[0].replaceWith($(`
                <div id="${id}_view" style="display:flex;flex-direction: column;align-items: stretch;">
                    <b>任务名称:<u>${data.task}</u></b>
                    <b>任务ID号:<u>${TID}</u> &nbsp 子线程数:<u>${data.Tid.length}</u></b>
                    <b>创建时间:<u>${data.startArgs}</u></b>
                    <b>运行进度:<u>${(parseFloat(data.psc)*100).toFixed(2)}</u>% &nbsp 测算速度:<u>${(parseFloat(data.speed)*100).toFixed(2)}</u>%/S</b>
                    <b>已经运行:<u>${((new Date().getTime()-data.startTime)/1000).toFixed(2)}</u>S &nbsp&nbsp 预估还需:<u>${parseFloat(data.forecast).toFixed(2)}</u>S</b>
                </div>
                `)[0]);
            }
        });
        this.bind(id,"sun",{
            sTid:[],
            render:(e)=>{
                let lst=this[id].lst;
                let N=lst.N;
                let tsk=lst.tsk;
                let Tid=[];
                if(N){
                    if(N>tsk.length){
                        N=tsk.length;
                    }
                }else{
                    if(tsk.length>0){
                        N=1;
                    }
                }
                if(N){
                    Tid=tsk[N-1][1].Tid;
                }
                let nTid=[];
                e.sTid.map(v=>{
                    if(Tid.indexOf(v)!=-1){
                        nTid.push(v);
                    }
                })
                e.sTid=nTid;
                $(`#${id}_sun`)[0].replaceWith($(`
                <select id="${id}_sun" size="2" class="scrollView" style="width:32.5%;" multiple>
                    <option disabled>任务子线程</option>
                    ${
                        Tid.map(T=>{
                            return `<option ${(e.sTid.indexOf(T)!=-1)?"selected":""}>${T}</option>`;
                        }).join('')
                    }
                </select>
                `)[0]);
                $(`#${id}_sun`).on("change",()=>{
                    e.sTid=[];
                    let rst=$(`#${id}_sun`)[0].selectedOptions;
                    Object.keys(rst).forEach((v)=>{
                        e.sTid.push(rst[v].value);
                    });
                    // console.log(e.sTid);
                });
            }
        })
        graph.TaskCurve(`${id}_flux`);
        this.setPosition(id,sit);
        this.setMoveable(id,`${id}_head`);
        return await new Promise(resolve=>{
            $(`#${id}_x`).on("click",()=>{
                delete this.task[id];
                resolve({
                    inf:this[id].inf.inf,
                    title:this[id].title.title,
                    event:"close"
                });
                this.closeWin(id);
            });
            $(`#${id}_cal`).on("click",()=>{
                delete this.task[id];
                resolve({
                    inf:this[id].inf.inf,
                    title:this[id].title.title,
                    event:"cancel"
                });
                this.closeWin(id);
            });
            $(`#${id}_change`).on("click",()=>{
                let mode=this[id].lst.mode;
                this[id].lst.mode=(++mode)%2;
            });
            $(`#${id}_kill_pgs`).on("click",()=>{
                let N=this[id].lst.N;
                let tsk=this[id].lst.tsk;
                if(N){
                    if(N>tsk.length){
                        N=tsk.length;
                    }
                    KillSomeThread(tsk[N-1][1].Tid);
                }else{
                    this.Toast("当前没有选中任务喔~",1000);
                }
            });
            $(`#${id}_kill_Thr`).on("click",()=>{
                KillSomeThread(this[id].sun.sTid);
            });
            $(`#${id}_kill`).on("click",()=>{
                KillAllThread();
            })
        });
    }
    closeWin(id){
        $(`#${id}`)[0].remove();
        delete this[id];
        return this;
	}
}

const wins = new Win_manager();

wins.taskBox({top:50});

