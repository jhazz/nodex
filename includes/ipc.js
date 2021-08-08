var ipcManifest

module.exports.manifest=function (serviceManifest){
  ipcManifest=serviceManifest
}

module.exports.sendStatus=function (status){
  process.send(JSON.stringify({cmd:'status',status:status}))  
}

module.exports.sendCommand=function (to, cmd, jmsg){
  jmsg.cmd=cmd
  jmsg.to=to
  process.send(JSON.stringify(jmsg))
}

process.on('message', (ipcMessage)=>{
  console.log('Received', ipcMessage)
  ipcCall(JSON.parse(ipcMessage))
})

function ipcCall(jmsg){
  let cmd=jmsg.cmd, from=jmsg.from??'main'
  if(!cmd){
    console.error(`IPC сообщение от '${from}' не содержит команды`)
    return false
  }

  let manifestEntry=ipcManifest.cmd[cmd], i, manifestArg , 
      v, hasErrors=false, mainfestArgType
  if(!!manifestEntry){ // contains fn, notes, args for the command
    for(i in manifestEntry.args){
      manifestArg=manifestEntry.args[i]
      mainfestArgType=(manifestArg.type==undefined) ? 'any' : manifestArg.type
      if(!manifestArg.optional){
        if(!(i in jmsg)){
          if(manifestArg.default != undefined){
            jmsg[i]=manifestArg.default
          } else {
            console.error(`IPC команда 'cmd:${cmd}' от '${from}' не соответствует манифесту. Поле '${i}:${mainfestArgType}' - обязательное. ${manifestArg.note}`)
            hasErrors=true
          }
        }
      } else {
        v=jmsg[i]
        if(mainfestArgType=='int'){
          v=parseInt(v)
          if(isNaN(v)) {
            console.error(`IPC команда 'cmd:${cmd}' от '${from}' не соответствует манифесту. Поле '${i}' должно быть целым числом .${manifestArg.note}`)
            hasErrors=true
          }
        }
      }
    }
    if(!hasErrors){
      return manifestEntry.fn(jmsg)
    }
  }

  return false
}

