const fs = require('fs');
const path = require('path');
const ipc=require('../../includes/ipc')
var home, msgProviderDir, msgProviderExe

ipc.manifest({
  title:'Сервис обслуживания видеорегистраторов по пассивному протоколу N9M',
  note:'При запуске указывается расположение бинарника, который устанавливает взаимодействие с видеорегистраторами',
  cmd:{
    start:{
      fn:start, note:'Запускает сервис обслуживания N9MP ', args:{
        msgProviderDir:{type:'string', note:'Путь, к папке с бинарником и его вспомогательными файлами'},
        msgProviderExe:{type:'string', note:'Имя самого бинарника'},
        home:{type:'string', note:'Путь к файловой папке, которая будет корневой для сервиса. Если msgProviderDir является относительным путем, то путь будет вычисляться относительно этого home'},
      }
    },
    httpSetup:{
      fn:httpSetup, note:'HTTP-страница настройки сервиса', args:{
        url:{type:'string', note:'Путь, по которому происходит вызов данной команды'},
        flowId:{type:'string', note:'Идентификатор HTTP-запроса, вызвавший данную команду'},
      }
    },
    bindToList:{
      fn:bindToList, args:{
        jmsg:{type:'json', note:'WSMessage полученный по websocket от браузера пользователя'},
        url:{type:'string', note:'HTTP-путь, по которому произошел вызов данной команды'},
        flowId:{type:'string', note:'Идентификатор HTTP-запроса, вызвавший данную команду'}
      }
    }
  }
})

function start(args){
  home = args.home
  msgProviderDir = args.msgProviderDir
  msgProviderExe = args.msgProviderExe
  if(!path.isAbsolute(msgProviderDir)){
    //console.log('Path',msgProviderDir,' is not absolute!')
    msgProviderDir=path.join(home,msgProviderDir)
  }
  console.log('N9MP executes in ',msgProviderDir+' file '+msgProviderExe)
  //process.send(JSON.stringify({cmd:'addHTTPRoute', to:'http', path:'n9mp_setup', emit:'httpSetup'}))
  //process.send(JSON.stringify({cmd:'addWsJsonHandler', to:'http', path:'*', key:'wscmd', value:'bind', emit:'wsDataBind'}))
  ipc.sendCommand('http', 'addHTTPRoute', {path:'n9mp_setup', emit:'httpSetup'})
  ipc.sendCommand('http', 'setWsHandler', {topic:'devicesList',  emit:'bindToList'})
  ipc.sendStatus('started')
}

function httpSetup(args) {
  ipc.sendCommand('http', 'httpResponse',{
    code:200, 
    flowId:args.flowId, 
    text:'This is a setup handler for url='+args.url})
}

function bindToList(args){
  var jmsg=args.jmsg
  console.log('N9MP bindToList received ',jmsg,' from ', args.url)
}

function restart() {

}

