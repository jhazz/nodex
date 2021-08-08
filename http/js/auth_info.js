(function (app) {
  var usingScreenId='auth_info'
  var title='Информация об аккаунте'
  var targetScreen, leftPanel, infoPanel

  function show(menuItem){
    var targetScreen=app.openScreen(usingScreenId, {onCloseScreen:onCloseScreen})
    if(!targetScreen) {
      return
    }
    targetScreen.el.innerHTML='<table width="100%" height="100%" cellpadding=0 cellspacing=0><tr valign="top"><td id="leftPanel" class="left-panel" ></td><td id="infoPanel" align="center"></td></tr></table>'
    leftPanel=app.$('#leftPanel')
    infoPanel=app.$('#infoPanel')
    infoPanel.innerHTML='<h1>'+title+'</h1>'

    app.auth.asyncGetSession(function(session){
      if(app.getScreenId()==usingScreenId){
        if(!session.authorized){
          return app.showUnathorizedScreen()
        }

        var plist, i,j,sp=[]
        for (i in session.permissions) {
          plist=session.permissions[i]
          sp.push(`${i} => `)
          for(j in plist){
            if(j>0) {
              sp.push(',')
            }
            sp.push(`${plist[j]}`)
          }
          sp.push('<br>')
        }

        var s=`<table><tr><td>Пользователь:</td><td>${session.login}</td></tr>\
        <tr><td>Права:</td><td>${sp.join('')}</td></tr></table>`
        infoPanel.innerHTML='<h1>'+title+'</h1>'+s
      }
    })
  }

  function onCloseScreen(){
    console.log('auth_info closed')
  }

  app.addRouteHandler('#auth_info', show)

}) (app);