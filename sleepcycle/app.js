(function(){
  var $=function(i){return document.getElementById(i)};
  var S={mode:'wake',time:'07:00',fall:15,cyc:90,fmt:'12'};
  try{Object.assign(S,JSON.parse(localStorage.getItem('sleepcycle')||'{}'))}catch(e){}
  function save(){try{localStorage.setItem('sleepcycle',JSON.stringify(S))}catch(e){}}
  function pad(n){return (n<10?'0':'')+n}
  function fmt(d){
    var h=d.getHours(),m=d.getMinutes();
    if(S.fmt==='24')return pad(h)+':'+pad(m);
    return ((h%12)||12)+':'+pad(m)+' '+(h<12?'AM':'PM');
  }
  function hm(min){var h=Math.floor(min/60),m=min%60;return h+'h'+(m?' '+m+'m':'')}
  function base(){
    if(S.mode==='now'){return new Date()}
    var p=S.time.split(':'),d=new Date();
    d.setHours(+p[0]||0,+p[1]||0,0,0);return d;
  }
  // pure calculation: returns [{date,cycles,minutes}]
  function calc(mode,anchor,fall,cyc){
    var out=[],n;
    if(mode==='wake'){
      for(n=6;n>=3;n--)out.push({cycles:n,minutes:n*cyc,date:new Date(anchor.getTime()-(n*cyc+fall)*6e4)});
    }else{
      var start=new Date(anchor.getTime()+fall*6e4);
      for(n=3;n<=6;n++)out.push({cycles:n,minutes:n*cyc,date:new Date(start.getTime()+n*cyc*6e4)});
    }
    return out;
  }
  window.__calc=calc;
  function render(){
    var mode=S.mode;
    document.querySelectorAll('.tabs button').forEach(function(b){
      var on=b.dataset.mode===(mode==='now'?'bed':mode);b.setAttribute('aria-selected',on)});
    var wake=mode==='wake';
    $('timeLabel').textContent=wake?'Wake-up time':'Bedtime';
    $('time').value=S.time;$('fall').value=S.fall;$('cyc').value=S.cyc;$('fmt').value=S.fmt;
    var a=base(),r=calc(wake?'wake':'bed',a,S.fall,S.cyc);
    $('hint').textContent=wake?'To wake at '+fmt(a)+', fall asleep at one of these times:'
      :(mode==='now'?'If you fall asleep now (about '+S.fall+' min from '+fmt(a)+'), wake at:':'If you go to bed at '+fmt(a)+', wake at:');
    $('results').innerHTML=r.map(function(x){
      var best=x.cycles>=5&&x.cycles<=6;
      return '<div class="res'+(best?' best':'')+'"><div class="t">'+fmt(x.date)+'</div><div class="m">'+x.cycles+' cycles · '+hm(x.minutes)+'</div>'+(best?'<span class="tag">Recommended</span>':'')+'</div>';
    }).join('');
  }
  document.querySelectorAll('.tabs button').forEach(function(b){
    b.onclick=function(){S.mode=b.dataset.mode;save();render()}});
  $('time').oninput=function(){if(this.value){S.time=this.value;if(S.mode==='now')S.mode='bed';save();render()}};
  $('now').onclick=function(){S.mode='now';render()};
  $('fall').onchange=function(){S.fall=Math.min(120,Math.max(0,parseInt(this.value,10)||0));save();render()};
  $('cyc').onchange=function(){S.cyc=Math.min(120,Math.max(60,parseInt(this.value,10)||90));save();render()};
  $('fmt').onchange=function(){S.fmt=this.value;save();render()};
  if(S.mode==='now')S.mode='bed';
  render();
  if('serviceWorker' in navigator&&location.protocol.indexOf('http')===0)navigator.serviceWorker.register('sw.js').catch(function(){});
})();
