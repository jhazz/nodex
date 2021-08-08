const fs = require('fs');
const child_process = require('child_process');
const app={
  config:JSON.parse(fs.readFileSync(__dirname+'/config.json')),
  services:{},
  dir:__dirname,
  servicesDir:__dirname+'/services',
  inboxes:{},
  restoreDownServiceTimeoutMs:5000
};


function termination(signal) {
  console.log(`Received ${signal}`);
  for(let serviceName in app.services) {
    if(serviceName!='main'){
      let service=app.services[serviceName];
      console.log('Terminating: ',serviceName);
      service.isNormalTermination=true;
      service.process.kill('SIGTERM');
    }
  }
}

function serviceDownSelf(service,code,signal){
  console.log('The service', service.name, "has been stopped, code:",code, "signal:",signal)
  service.status='stopped'
  if(!service.isNormalTermination){
    // Если сервис убил сам себя по какой-то причине, то все-равно пытаемся его поднять
    //  если он не был остановлен нами, через 5 секунд (по-умолчанию в app.restoreDownServiceTimeoutMs)
    setTimeout(()=>{
      console.log('Service '+service.name+ ' is restarting after down')
      serviceStart(service.name)
    },app.restoreDownServiceTimeoutMs)

  }
}

function serviceDownByError(service,error){
  console.log('The service has down by error:', service.name,"errorcode:",error)
  service.status='broken'
  if(error==1) {
    service.status='failed'
    console.log('Error code 1 means that service '+service.name+' must be restarted. Restarting after 15 seconds...')
    setTimeout(()=>{
      console.log('Service '+service.name+ ' is restarting after error')
      serviceStart(service.name)
    },app.restoreDownServiceTimeoutMs)
  }
}

function serviceStart(serviceName) {
  if(!!app.services[serviceName]){
    console.log('Already started ',serviceName)
    return true
  }

  var scriptPath=app.servicesDir+'/'+serviceName+'/'+serviceName+'.js'
  fs.access(scriptPath, fs.constants.R_OK, (err)=>{
    if(err){
      console.log('Check access ERROR!', scriptPath)
      return false
    }
    var config=app.config.services[serviceName]
    var options={
      cwd:app.dir,
      detached:true,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    }
    var process=child_process.fork(scriptPath,[],options)
    var service=app.services[serviceName]={
      name: serviceName,
      process: process,
      status:'starting',
    }

    //process.stdin.write("start\n")

    let streamout=process.stdout;
    streamout.setEncoding('utf8');
    streamout.on('data', (data) => {
      console.log('LOG['+serviceName+']: ', data)
    })
    let streamerr=process.stderr
    streamerr.setEncoding('utf8');
    streamerr.on('data', (data) => {
      console.log('ERR['+serviceName+']: ', data)
    })

    var msg={}, argName, argValue
    if (config!==undefined) {
      for (argName in config) {
        argValue=config[argName]
        msg[argName]=argValue
      }
    }
    msg.home=__dirname
    msg.cmd='start'

    process.send(JSON.stringify(msg))
    process.on('message',msg=>{
      console.log('Service [main] received message',msg, 'from', serviceName)
      var json=JSON.parse(msg)
      var to=json.to
      if(!to) {
          processMainMessage(serviceName, json)
      } else {
        json.from=serviceName
        console.log('Sending ',json)
        let toService=app.services[to]
        if((!toService)||((toService.status!=='started'))) {
          console.error(`Service [${to}] is not ready. Keep mesage to inbox`)
          if(!app.inboxes[to]) app.inboxes[to]=[]
          app.inboxes[to].push(json)
        } else {
          toService.process.send(JSON.stringify(json))
        }
      }
    })

    process.on('error',e=>serviceDownByError(service,e));
    process.on('exit',(code,signal)=>serviceDownSelf(service,code,signal));
  })

}
function processMainMessage (serviceName, json){
  let inJson, service
  service=app.services[serviceName]
  if(!!service){
    if(json.cmd=='status'){
      let newStatus=json.status
      switch(newStatus){
        case 'starting':
          console.log(`[main] received from [${serviceName}] that service is starting`)
          break
        case 'started':
          let inbox=app.inboxes[serviceName]
          console.log(`[main] received from [${serviceName}] that service is started`)
          if((inbox!=undefined)&&(inbox.length>0)){
            while( (inJson=inbox.shift())!==undefined){
              console.log(`[main] resend message for [${serviceName}]`, inJson)
              service.process.send(JSON.stringify(inJson))
            }
          }
      } // switch
      service.status=newStatus
    }
  }

}

function bootstrap(){
  process.on('SIGINT', termination);
  process.on('SIGTERM', termination);
  app.services['main']={name:'service', process:process, status:'started'}
  for(let serviceName in app.config.services) {
    console.log('Bootstrap:',serviceName)
    serviceStart(serviceName)
  }
}

bootstrap()
