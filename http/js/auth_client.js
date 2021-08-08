/** 
 * AUTH Client 
 * */

 
(function (app) {
  var $=app.$
  app.auth={}

  var session={}
  var listeners={}

  app.auth.asyncGetSession=function(callback){
    if(session.authorized) {
      return callback(session)
    }
    app.auth.on('authChanged',function (s){
      callback(s)
    })
  }

  app.auth.getSession=function(){
      return session
  }

  app.auth.isAuthorized=function(){
    return session.authorized
  }

  app.auth.emitEvent=function(eventName,params){
    // Если слушатель не вернет true, то он будет удален из списка слушателей!
    var r,l
    if(eventName in listeners) {
      l=listeners[eventName]
      for (var i in l){
        r=l[i](params)
        if(r===false) {
          delete l[i]
        }
      }
    }
  }

  app.auth.asyncLoadPermissions=function (callback){
      app.sendJSON('/httpsvc_auth', {cmd:'loadPermissions'},function (data,haserror){
        if(!haserror){
          if(data.authorized){
            session.authorized=true
            session.permissions=data.permissions
            session.userInfo=data.userInfo
            session.login=data.login
            app.auth.emitEvent('authChanged',session)
            callback(true)
          } else {
            session.user=undefined
            session.login=undefined
            session.permissions=undefined
            session.authorized=false
            app.auth.emitEvent('authChanged',session)
            callback(false)
          }
        } else {
          app.auth.emitEvent('authChanged',session)
          callback(false)
        }
      })
    }

  app.auth.on=function(eventType /** 'authChanged' */, callback){
    if(!listeners[eventType]) {
      listeners[eventType]=[callback]
    } else {
      listeners[eventType].push(callback)
    }
  }


  app.addRouteHandler('#showSignin', function () {
    var t = $('#mainContainer')
    if(!t) {return}
    t.innerHTML = '<form id="signinForm"><h2>Введите ваш логин или email</h2><div><input type="text" name="login" placeholder="Ваш логин" autocomplete="username"></div>' +
      '<div><input type="password" name="password" placeholder="Ваш пароль" autocomplete="current-password" ></div>' +
      '<div><button name="btnSubmit" disabled>Войти</button></div>'+
      '<div id="notes">Ожидание ответа от сервиса авторизации</div></form>'
    
    session.clientNonce=Math.random()
    session.serverToken=undefined
    var signinForm=$('#signinForm')
    signinForm.addEventListener('submit',function(event){
      app.signinSubmit()
      event.preventDefault()
    }, true)

    app.sendJSON('/httpsvc_auth', {cmd:'preSignin', clientNonce:session.clientNonce},function(data,hasError){
      if(!hasError){
        if(!!data.serverToken){
          session.serverToken=data.serverToken
          signinForm['btnSubmit'].removeAttribute("disabled")
          
          $('#notes').innerText=''
        } else {
          $('#notes').innerText='Неправильный стандарт обмена с сервером'
        }
      } else {
        $('#notes').innerText=data.error
      }
    })
  }, true)


  app.signinSubmit = function () {
    if(!session.serverToken){
      return
    }
    var form = $('#signinForm')
    var login = form.login.value
    var pass = form.password.value
    var passSign=app.sha1.b64_sha1(session.serverToken+login+pass)
    app.sendJSON('/httpsvc_auth', { cmd:'signin', clientNonce:session.clientNonce, login:login, passSign:passSign},function(data, hasError){
      if(!hasError){
        session.user=data
        console.log('Session authorized!', session.data)
        
        app.auth.asyncLoadPermissions(function (isAuthorized){
          location.href='#auth_info'
          console.log('Пользователь авторизован. Перенаправляем его на #auth_info')
        })
      } else {
        $('#notes').innerText='Ошибка: '+data.error
      }
    })
  }

  app.auth.listeners=listeners
}) (app);


app.sha1={};

(function (exports){
  /*
   * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
   * in FIPS PUB 180-1
   * Version 2.1a Copyright Paul Johnston 2000 - 2002.
   * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
   * Distributed under the BSD License
   * See http://pajhome.org.uk/crypt/md5 for details.
   */

  /*
   * Configurable variables. You may need to tweak these to be compatible with
   * the server-side, but the defaults work in most cases.
   */
  var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
  var b64pad = ""; /* base-64 pad character. "=" for strict RFC compliance   */
  var chrsz = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */

  /*
   * These are the functions you'll usually want to call
   * They take string arguments and return either hex or base-64 encoded strings
   */
  function hex_sha1(s) { return binb2hex(core_sha1(str2binb(s), s.length * chrsz)); }
  function b64_sha1(s) { return binb2b64(core_sha1(str2binb(s), s.length * chrsz)); }
  function str_sha1(s) { return binb2str(core_sha1(str2binb(s), s.length * chrsz)); }
  function hex_hmac_sha1(key, data) { return binb2hex(core_hmac_sha1(key, data)); }
  function b64_hmac_sha1(key, data) { return binb2b64(core_hmac_sha1(key, data)); }
  function str_hmac_sha1(key, data) { return binb2str(core_hmac_sha1(key, data)); }

  /*
   * Perform a simple self-test to see if the VM is working
   */
  function sha1_vm_test() {
    return hex_sha1("abc") == "a9993e364706816aba3e25717850c26c9cd0d89d";
  }

  /*
   * Calculate the SHA-1 of an array of big-endian words, and a bit length
   */
  function core_sha1(x, len) {
    /* append padding */
    x[len >> 5] |= 0x80 << (24 - len % 32);
    x[((len + 64 >> 9) << 4) + 15] = len;

    var w = Array(80);
    var a = 1732584193;
    var b = -271733879;
    var c = -1732584194;
    var d = 271733878;
    var e = -1009589776;

    for (var i = 0; i < x.length; i += 16) {
      var olda = a;
      var oldb = b;
      var oldc = c;
      var oldd = d;
      var olde = e;

      for (var j = 0; j < 80; j++) {
        if (j < 16) w[j] = x[i + j];
        else w[j] = rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
        var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
          safe_add(safe_add(e, w[j]), sha1_kt(j)));
        e = d;
        d = c;
        c = rol(b, 30);
        b = a;
        a = t;
      }

      a = safe_add(a, olda);
      b = safe_add(b, oldb);
      c = safe_add(c, oldc);
      d = safe_add(d, oldd);
      e = safe_add(e, olde);
    }
    return Array(a, b, c, d, e);

  }

  /*
   * Perform the appropriate triplet combination function for the current
   * iteration
   */
  function sha1_ft(t, b, c, d) {
    if (t < 20) return (b & c) | ((~b) & d);
    if (t < 40) return b ^ c ^ d;
    if (t < 60) return (b & c) | (b & d) | (c & d);
    return b ^ c ^ d;
  }

  /*
   * Determine the appropriate additive constant for the current iteration
   */
  function sha1_kt(t) {
    return (t < 20) ? 1518500249 : (t < 40) ? 1859775393 :
      (t < 60) ? -1894007588 : -899497514;
  }

  /*
   * Calculate the HMAC-SHA1 of a key and some data
   */
  function core_hmac_sha1(key, data) {
    var bkey = str2binb(key);
    if (bkey.length > 16) bkey = core_sha1(bkey, key.length * chrsz);

    var ipad = Array(16), opad = Array(16);
    for (var i = 0; i < 16; i++) {
      ipad[i] = bkey[i] ^ 0x36363636;
      opad[i] = bkey[i] ^ 0x5C5C5C5C;
    }

    var hash = core_sha1(ipad.concat(str2binb(data)), 512 + data.length * chrsz);
    return core_sha1(opad.concat(hash), 512 + 160);
  }

  /*
   * Add integers, wrapping at 2^32. This uses 16-bit operations internally
   * to work around bugs in some JS interpreters.
   */
  function safe_add(x, y) {
    var lsw = (x & 0xFFFF) + (y & 0xFFFF);
    var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xFFFF);
  }

  /*
   * Bitwise rotate a 32-bit number to the left.
   */
  function rol(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt));
  }

  /*
   * Convert an 8-bit or 16-bit string to an array of big-endian words
   * In 8-bit function, characters >255 have their hi-byte silently ignored.
   */
  function str2binb(str) {
    var bin = Array();
    var mask = (1 << chrsz) - 1;
    for (var i = 0; i < str.length * chrsz; i += chrsz)
      bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (32 - chrsz - i % 32);
    return bin;
  }

  /*
   * Convert an array of big-endian words to a string
   */
  function binb2str(bin) {
    var str = "";
    var mask = (1 << chrsz) - 1;
    for (var i = 0; i < bin.length * 32; i += chrsz)
      str += String.fromCharCode((bin[i >> 5] >>> (32 - chrsz - i % 32)) & mask);
    return str;
  }

  /*
   * Convert an array of big-endian words to a hex string.
   */
  function binb2hex(binarray) {
    var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
    var str = "";
    for (var i = 0; i < binarray.length * 4; i++) {
      str += hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8 + 4)) & 0xF) +
        hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8)) & 0xF);
    }
    return str;
  }

  /*
   * Convert an array of big-endian words to a base-64 string
   */
  function binb2b64(binarray) {
    var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var str = "";
    for (var i = 0; i < binarray.length * 4; i += 3) {
      var triplet = (((binarray[i >> 2] >> 8 * (3 - i % 4)) & 0xFF) << 16)
        | (((binarray[i + 1 >> 2] >> 8 * (3 - (i + 1) % 4)) & 0xFF) << 8)
        | ((binarray[i + 2 >> 2] >> 8 * (3 - (i + 2) % 4)) & 0xFF);
      for (var j = 0; j < 4; j++) {
        if (i * 8 + j * 6 > binarray.length * 32) str += b64pad;
        else str += tab.charAt((triplet >> 6 * (3 - j)) & 0x3F);
      }
    }
    return str;
  }

  function rc4(key, str) {
    var s = [], j = 0, x, res = '';
    for (var i = 0; i < 256; i++) {
      s[i] = i;
    }
    for (i = 0; i < 256; i++) {
      j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
      x = s[i];
      s[i] = s[j];
      s[j] = x;
    }
    i = 0;
    j = 0;
    for (var y = 0; y < str.length; y++) {
      i = (i + 1) % 256;
      j = (j + s[i]) % 256;
      x = s[i];
      s[i] = s[j];
      s[j] = x;
      res += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
    }
    return res;
  }

  exports.rc4=rc4
  exports.b64_sha1=b64_sha1  
  exports.binb2b64=binb2b64
})(app.sha1)