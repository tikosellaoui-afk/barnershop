var http=require('http'),f=require('fs'),p=require('path');

// Quick syntax check
var html = f.readFileSync(p.join(__dirname,'client','index.html'),'utf8');
var js = html.split('<script>')[1].split('</script>')[0];
try { new Function(js); console.log('JS SYNTAX: OK'); } catch(e) { console.log('JS SYNTAX ERROR:', e.message); process.exit(1); }

// Start server
var server = require('./_server.js');

// Wait a bit then test
setTimeout(function(){
  http.get('http://localhost:3000/', function(res){
    var d='';
    res.on('data',function(c){d+=c});
    res.on('end',function(){
      var ok=true;
      function check(name,cond){if(!cond){console.log('FAIL: '+name);ok=false;}else{console.log('PASS: '+name);}}
      check('Status 200', res.statusCode===200);
      check('FALLBACK_IMG fixed (no single quotes in SVG)', !d.match(/xmlns='/));
      check('Has data-pane on buttons', d.includes('data-pane='));
      check('showPane uses this', d.includes('showPane(this)'));
      check('Hero has background image', d.includes('photo-1585747861115'));
      check('Service modal ternary fixed', d.includes("s?s.desc||'':'':''") || d.includes("s?s.desc||'':''));
      if(ok) console.log('\nALL CHECKS PASSED');
      else console.log('\nSOME CHECKS FAILED');
      server.close();
    });
  });
}, 500);
