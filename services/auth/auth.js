/**
 * AUTH Server
 * */

const ipc=require('../../includes/ipc')
const sha1=require('./sha1')
const clientNonces={}
const sessions={}

ipc.manifest({
  cmd:{
    httpsvc_auth_get:{
      fn:httpsvc_auth_get, args:{
        url:{type:'string', note:'Путь, по которому происходит вызов данной команды'},
        flowId:{type:'string', note:'Идентификатор HTTP-запроса, вызвавший данную команду'},
      }
    },
    httpsvc_auth_post:{
      fn:httpsvc_auth_post, args:{
        sessionId:{type:'string',note:'Сессия, которая будет авторизована',optional:1},
        url:{type:'string', note:'Путь, по которому происходит вызов данной команды'},
        text:{type:'string', note:'Данные из POST части HTTP запроса'},
        flowId:{type:'string', note:'Идентификатор HTTP-запроса, вызвавший данную команду'},
      }
    },
    authorizeHTTPRequest:{
      fn:authorizeHTTPRequest,args:{
        sessionId:{type:'string',note:'Возможно есть сессия, которая будет авторизована',optional:1},
        flowId:{type:'string', note:'Идентификатор HTTP-запроса, вызвавший данную команду'},
        url:{type:'string', note:'Путь, по которому происходит вызов данной команды'},
        next:{type:'json', note:'Что запустить следом после определения сессии. Внутри: to,cmd'}
      }
    },/*
    getSessionStatus:{
      fn:sessionStatus, args:{
        sessionId:{type:'string'}
      }
    },*/
    start:{
      fn:start, args:{
        datasource:{type:'string', note:'Указывает имя источника данных, в которых будут храниться сессии'}
      }
    }
  }})

  
function start(args){
  ipc.sendCommand('http', 'addHTTPRoute', {path:'httpsvc_auth', emit:'httpsvc_auth_get', useSession:1})
  ipc.sendStatus('started')
}

function authorizeHTTPRequest(args){
  var next=args.next
  var sessionId=args.sessionId ,session
  session=sessions[sessionId]
  if(!session) {
    session=sessions[sessionId]={authorized:0}
  }
  var args={flowId:args.flowId, url:args.url}
  if(!!session){
    args.sessionId=sessionId
  }
  ipc.sendCommand(next.to, next.cmd, args)
}

function httpsvc_auth_get(args){
  ipc.sendCommand('http', 'httpGetPostText',{
    flowId:args.flowId, 
    sessionId:args.sessionId, 
    onpost:'httpsvc_auth_post'
  })
}

function httpsvc_auth_post(args){
  if(args.error){
    if(args.error.code=='ECONNRESET'){
      console.error('Client dropped its connection during authorization process')
    }
    return
  }
  var post=JSON.parse(args.text)
  var clientNonce
  var sessionId=args.sessionId
  var session=sessions[sessionId]
  switch(post.cmd){
    case 'preSignin':
      clientNonce=('|'+post.clientNonce).substr(0,20)
      if(!!clientNonces[clientNonce]){
        ipc.sendCommand('http', 'httpResponse',{
          code:200, 
          flowId:args.flowId, 
          text:JSON.stringify({error:'Repeated clientNonce! Ignore it'})
        })
        return
      }
      let serverNonce='S'+Math.random()
      let serverToken=sha1.b64_sha1(serverNonce+clientNonce)
      clientNonces[clientNonce]={serverNonce:serverNonce, serverToken:serverToken}
      ipc.sendCommand('http', 'httpResponse',{
        code:200, 
        flowId:args.flowId, 
        text:JSON.stringify({
          serverToken:serverToken,
          info:'This is a auth POST handler for url='+args.url
        })
      })
      break
    case 'signin':
      if(!session){
        ipc.sendCommand('http', 'httpResponse',{
          code:200, 
          flowId:args.flowId, 
          text:JSON.stringify({
            error:'Session is unavailvable. Refresh page, please!'
          })
        })
        return
      }
      
      
      clientNonce=('|'+post.clientNonce).substr(0,20)
      let c
      if(clientNonce in clientNonces){
        c=clientNonces[clientNonce]
      } else {
        let err='Unknown clientNonce! Ignore it'
        console.error(err)
        ipc.sendCommand('http', 'httpResponse',{
          code:200, 
          flowId:args.flowId, 
          text:JSON.stringify({
            authorized:0,
            error:err
          })
        })
        return
      }
      let login=post.login
      if(!login) {
        let err='No login entered'
        console.error(err)
        ipc.sendCommand('http', 'httpResponse',{
          code:200, 
          flowId:args.flowId, 
          text:JSON.stringify({
            authorized:0,
            error:err
          })
        })
        return
      }
      
      let user=userRegistry.authorize(login, c.serverToken, post.passSign)
      if(user==undefined){
        let err='Неизвестный логин и пароль'
        console.error(err)
        ipc.sendCommand('http', 'httpResponse',{
          code:200, 
          flowId:args.flowId, 
          text:JSON.stringify({
            authorized:0,
            error:err
          })
        })
        return
      }
      console.log('SIGNIN SUCCESSFUL:', user.info.name)
      if(session){
        session.user=user
        session.user.login=login
        session.authorized=1
        ipc.sendCommand('http', 'httpResponse',{
          code:200, 
          flowId:args.flowId, 
          text:JSON.stringify({
            authorized:session.authorized,
            userInfo:session.user.info,
            permissions:session.user.permissions,
            login:session.user.login
          })
        })
      }
      break
    case 'loadPermissions':
      if(!session){
        ipc.sendCommand('http', 'httpResponse',{
          code:200, 
          flowId:args.flowId, 
          text:JSON.stringify({
            authorized:0,
            error:'Session unsupported!'
          })
        })
        return
      }

      if(session.authorized){
        ipc.sendCommand('http', 'httpResponse',{
          code:200, 
          flowId:args.flowId, 
          text:JSON.stringify({
            authorized:session.authorized,
            userInfo:session.user.info,
            permissions:session.user.permissions,
            login:session.user.login
          })
        })
      } else {
        ipc.sendCommand('http', 'httpResponse',{
          code:200, 
          flowId:args.flowId, 
          text:JSON.stringify({
            authorized:0,
          })
        })

      }
      break
  }
}
  
var userRegistry={
  authorize:function(login, anyToken, sign) {
    var registry={
      'admin':{info:{name:'Administrator'} , 
        pass:'123',
        roles:['admin'], 
        permissions:{
          mainMenu:['system_info','devices_info']
        }
      }
    }
    let u=registry[login]
    if(!u) return
    var mustBe=sha1.b64_sha1(anyToken + login + u.pass)
    if (sign===mustBe){
      return u
    } else {
      console.error('Authorization failed!', sign,mustBe)
      return
    }
  }
}