(function (app) {
  var targetScreen, leftPanel, infoPanel
  var usingScreenId='system_info'
  var title='Общая информация'

  function show(menuItem){
    targetScreen=app.openScreen(usingScreenId, {onCloseScreen:onCloseScreen})
    if(!targetScreen) {
      return
    }
    targetScreen.el.innerHTML='<table width="100%" height="100%" cellpadding=0 cellspacing=0><tr valign="top"><td id="leftPanel" class="left-panel" ></td><td id="infoPanel" align="center"></td></tr></table>'
    leftPanel=app.$('#leftPanel')
    infoPanel=app.$('#infoPanel')

    app.auth.asyncGetSession(function(session){
      if(app.getScreenId()==usingScreenId){
        if(!session.authorized){
          return app.showUnathorizedScreen()
        }
        if (session.permissions.mainMenu.indexOf(usingScreenId)!==-1){
          infoPanel.innerHTML='<h1>'+title+'</h1>'
        }
      }
    })
  }

  function onCloseScreen(){
    console.log(usingScreenId+' is closed')
  }

  app.addRouteHandler('#system_info',show)

}) (app);