var app = {
  isSecured: false, isInited: false,
  homePath: '/',
  routeHandlers: {},
  wsb:null,
  menuDefinitions: {
    // Набор этих id указывается в массиве доступных пунктов меню пользователю user.permissions.mainMenu
    // Права на доступ пользователя к ресурсам определется сервером
    'system_info': { label: 'Общая информация', href: '#system_info' },
    'devices_info': { label: 'Устройства', href: '#devices_info' },
    'auth_info': { label: 'Мои параметры', href: '#auth_info' }
  }
};


(function (globals, app) {
  var currentScreen, currentScreenId

  window.addEventListener('load', function () {
    if (location.protocol === 'https:') {
      app.isSecured = true
    }
    app.addRouteHandler('#',showHomeScreen,true)
    app.wsb=new WebsocketBroker()
    initScreen()
  })

  function getRandomStr(){
    return Math.random().toString(36).substring(2) + (new Date()).getTime().toString(36)
  }

  window.addEventListener('hashchange', function () {
    // auth_client.js загружается после сработки этого события,
    // соответственно app.auth еще не проинициализирован, надо делать timeout
    window.setTimeout(initScreen, 0)
  })

  function showHomeScreen(){
    var targetScreen=app.openScreen('home', {})
    targetScreen.el.innerHTML = 'Здравствуйте!'
  }

  function WebsocketBroker(){
    this.outbox=[]
    var p = location.host
    var self=this
    var href = ((app.isSecured) ? 'wss' : 'ws') + '://' + p + '/n9mp_setup'
    this.ws = new WebSocket(href)
    this.handlers={}
    this.ws.onmessage = (event)=>{
      console.log('WebsocketBroker: received ', event.data)
      var jsonData=JSON.parse(event.data)
      var clientModule=jsonData.clientModule
      var clientTopic=jsonData.clientTopic
      var topics=this.handlers[clientModule]
      var h,i,handlerSet
      if(!!topics) {
        handlerSet=topics[clientTopic]
        if(!!handlerSet){
          for(i in handlerSet){
            h=handlerSet[i]
            h.receive(jsonData)
          }
        } else {
          handlerSet=topics['*']
          if(!!handlerSet){
            for(i in handlerSet){
              h=handlerSet[i]
              h.receive(jsonData)
            }
          } else {
            console.log('WebsocketBroker: Message for ',clientModule ,' has no topic ',jsonData)
          }
        }
      } else {
        console.log('WebsocketBroker: Message has unknown clientModule ',jsonData)
      }
    }

    this.ws.onopen = function(event){
      var msg
      while((msg=self.outbox.shift())!==undefined) {
        this.send(JSON.stringify(msg))
      }
    }

    this.ws.onclose = function(event){
      alert('Связь с сервером прекращена. Для восстановления работоспособности надо будет обновить страницу')
    }

  }


  WebsocketBroker.prototype.setTopicState=function(clientModuleExp, clientTopicExp, state){
    var moduleRe=new RegExp(clientModuleExp,'i')
    var topicRe
    if(clientTopicExp !== undefined){
      topicRe = new RegExp(clientTopicExp,'i')
    }
    var i,h,clientModule, topics, clientTopic, handlerSet, removingTopics
    for (clientModule in this.handlers){
      if(moduleRe.exec(clientModule)===null)
        continue
      topics=this.handlers[module]
      for (clientTopic in topics){
        if ((topicRe==undefined) || ((topicRe!=undefined) && (topicRe.exec(clientTopic)!==null))){
          handlerSet=topics[clientTopic]
          for (i in handlerSet){
            h=handlerSet[i]
            if(h.state){
              if(h.state(clientModule, clientTopic, state)===true){
                if(removingTopics===undefined){
                  removingTopics={}
                }
                removingTopics[clientModule]=true
              }
            }
          }
        }
      }

      if(removingTopics!==undefined){
        for(clientTopic in removingTopics){
          handlerSet=topics[clientTopic]
          for (i in handlerSet){
            h=handlerSet[i]
            if(h.state){
              h.state(clientModule, clientTopic, 'remove')
            }
          }
          delete topics[clientTopic]
        }
        removingTopics=undefined
      }
    }
  }

  /* args={
      serverModule:'n9mp',
      dataset:'devices',
      clientModule:usingScreenId,
      clientTopic:'devices_list',
      parameters:{
        sortBy:{asc:['timeConnected']},
        rowsPerPage:10,
        fields:{
          'deviceId':{type:'string', width:'20'},
          'timeConnected':{type:'string', width:'20'},
          'ipAddr':{type:'string', width:'20'}
        }
      }
    }*/
  
  

  WebsocketBroker.prototype.createPipe=function(serverModule, dataTopic, initParams, cbReceive, cbState){
    var pipe=this.addHandler('datapipe', dataTopic, cbReceive, cbState)
    pipe.initParams=initParams
    pipe.id=getRandomStr()
    var msg={
      cmd:'createPipe',
      id:pipe.id,
      to:serverModule,
      topic:dataTopic,
      initParams:initParams
    }

    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send (JSON.stringify(msg))
    } else {
      this.outbox.push(msg)
    }
    return pipe
  }

  WebsocketBroker.prototype.addHandler=function(clientModule, clientTopic, cbReceive, cbState){
    var topics=this.handlers[clientModule]
    if(!topics) {
      topics=this.handlers[clientModule]={}
    }
    var handlers=topics[clientTopic]
    if(!handlers) {
      handlers=topics[clientTopic]=[]
    }
    var handler={clientModule:clientModule, 
      clientTopic:clientTopic, 
      cbReceive:cbReceive, 
      cbState:cbState
    }
    handlers.push(handler)
    return handler
  }

  function onauthchanged(session) {
    var t = app.$('#topBarContainer')
    var elmainContainer = app.$('#mainContainer')

    if (session.authorized) {
      t.innerHTML = '<table width="100%" cellspacing=0 cellpadding=0><tr valign="top"><td class="topmenu">' +
        '<span id="logo">Сервер ОРБИТА</span><span id="topMenuItems"></span></td>' +
        '<td align="right" class="topmenu"><span class="mainmenu-item" id="userButton"></span></td></tr></table>'

      console.log("CALLED app.onauthchanged")
      var eluserButton = app.$('#userButton')
      eluserButton.innerText = session.userInfo.name
      eluserButton.addEventListener("click", function (ev) {
        location.href = "#auth_info"
      })
      app.mainMenuObj = renderTabMenu(session.permissions.mainMenu, 'mainmenu', 'mainmenu-item')
      app.$('#topMenuItems').appendChild(app.mainMenuObj.el)
    } else {
      app.mainMenuObj = {}
      t.innerHTML = ''
      showUnathorizedScreen()
    }
  }

  function initScreen() {

    function _executeRouteHandlers(isAuthorized){
      var p1, p2, i, hashLeast = window.location.hash, handlerTuple, handlerName,  part, params
      console.log('Выполняю '+hashLeast)
      if (hashLeast==='') {
        hashLeast='#'
      }

      do {
        p1 = hashLeast.indexOf('#')
        //debugger;
        if (p1 != -1) {
          p2 = hashLeast.indexOf('#', p1 + 1)
          if (p2 !== -1) {
            part = hashLeast.substring(p1, p2)
            hashLeast = hashLeast.substring(p2)
          } else {
            part = hashLeast.substring(p1)
            hashLeast = ''
          }
          var elements = part.split('?')
          handlerName = elements[0]
          if (handlerName in app.routeHandlers) {
            handlerTuple=app.routeHandlers[handlerName]
            if((!handlerTuple[1]) && (!isAuthorized)) { // NOT isPublic
              continue
            }
            params = {}
            if (elements.length == 2) {
              paramElements = elements[1].split('&')
              for (i in paramElements) {
                param = paramElements[i].split('=')
                if (param.length == 2) {
                  params[param[0]] = param[1]
                }
              }
            }
            handlerTuple[0](params)
          }
        }
      } while (p1 != -1)
    };

    if (app.isInited) {
      _executeRouteHandlers(app.auth.isAuthorized())
    } else {
      app.isInited = true
      if(!app.auth){
        alert('Не загружен скрипт авторизации')
        return
      }
      app.auth.on('authChanged', onauthchanged)
      app.auth.asyncLoadPermissions(function(isAuthorized){
        _executeRouteHandlers(isAuthorized)
      })
    }
  }

  function sendJSON(url, json, onload, responseType, method) {
    if (!responseType) {
      responseType = 'json'
    }
    var xhr = new XMLHttpRequest(), stringify = JSON.stringify;

    if (!method)
      method = 'POST'

    xhr.open(method, url)
    xhr.responseType = responseType
    xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8')
    if (typeof json == 'string')
      xhr.send(json)
    else
      xhr.send(stringify(json))

    xhr.onload = function (progress) {
      if (progress.target.status !== 200) {
        return onload({ error: 'Ошибка подключения ' + progress.target.status, url: url }, true)
      }
      if (progress.target.response === null) {
        return onload({ error: 'Ошибка обработки ответа от сервера', url: url, json }, true)
      }
      if ('error' in progress.target.response) {
        return onload(progress.target.response, true)
      }
      return onload(progress.target.response, false)

    };
    xhr.onerror = function (response) { return onload(response.target, true) };

    return xhr
  }

  function sendRequestForText() {
    location.href = '#requestTabs?do=showResponse'
    document.getElementById("response_area").innerText = "Please wait";
    var xhr = doq.sendJSON('?a=json_demo1_post', document.getElementById("request_area").innerText,
      function () {
        document.getElementById("response_area").innerText = this.response;
      }, 'text')
  }



  function renderTabMenu(menuIds, menuClass, menuItemClass) {
    var i, item, menuItem, label, menuObj = {}
    // if(!!this.destroy) this.destroy()
    menuObj.el = document.createElement('div')
    menuObj.el.className = menuClass
    menuObj.select = function (amenuItem) {
      // this - menuObj
      if (!!this.activeItemEl) {
        this.activeItemEl.classList.remove('selected')
      }
      this.activeItemEl = amenuItem.labelEl
      amenuItem.labelEl.classList.add('selected')
      if (amenuItem.defs.onclick) {
        var fn = amenuItem.defs.onclick
        app[fn].call(this, amenuItem)
      }
    }



    menuObj.items = {}
    var menuId, defs, menuItem, labelEl
    for (var i in menuIds) {
      menuId = menuIds[i]
      defs = app.menuDefinitions[menuId]
      labelEl = document.createElement('div')
      labelEl.className = menuItemClass
      menuItem = { labelEl: labelEl, defs: defs }
      if (defs.onclick) {
        labelEl.innerText = defs.label
        void (function (menuObj, menuItem) {
          labelEl.addEventListener('click', function () {
            menuObj.select.call(menuObj, menuItem)
          })
        })(menuObj, menuItem);
      } else if (defs.href) {
        labelEl.innerHTML = '<a href="' + defs.href + '">' + defs.label + '</a>'
      }
      menuObj.el.appendChild(labelEl)
      menuObj.items[menuId] = menuItem
    }
    return menuObj
  }

  function openScreen(screenId, screenOptions) {
    if ((currentScreenId != undefined) && (screenId === currentScreenId)) {
      return
    }
    if (currentScreen != undefined) {
      closeScreen()
    }
    currentScreenId = screenId
    var el = app.$('#mainContainer')
    el.innerHTML = ''
    currentScreen = { onCloseScreen: screenOptions.onCloseScreen, el: el }
    return currentScreen
  }

  function getScreenId() {
    return currentScreenId
  }

  function closeScreen() {
    if (currentScreen == undefined) return
    if (currentScreen.onCloseScreen) {
      currentScreen.onCloseScreen()
    }
    currentScreenId = undefined
    currentScreen = undefined
  }


  function $(id) { return document.querySelector(id) }

  function addRouteHandler(routePathWithHash, callback, isPublic) {
    if(!isPublic) {
      isPublic=false
    }
    app.routeHandlers[routePathWithHash] = [callback, isPublic]
  }

  function showUnathorizedScreen() {
    location.href = "#showSignin"
  }
  app.$ = $
  app.sendJSON = sendJSON
  app.openScreen = openScreen
  app.getScreenId = getScreenId
  app.addRouteHandler = addRouteHandler
  app.showUnathorizedScreen = showUnathorizedScreen

})(window, app);
