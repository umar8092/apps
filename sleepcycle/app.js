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
  // The time you typed, as a moment. For a wake-up time, that is the NEXT time the clock shows it (tonight's sleep -> tomorrow morning).
  function base(){
    var p=S.time.split(':'),d=new Date(),now=new Date();
    d.setHours(+p[0]||0,+p[1]||0,0,0);
    if(S.mode==='wake'&&d<=now)d.setDate(d.getDate()+1);
    return d;
  }
  // pure calculation: returns [{date,cycles,minutes}]
  //   wake: the times to GET INTO BED so you are asleep (after `fall` minutes) and wake exactly at the end of a cycle
  //   bed:  the times to set the ALARM if you get into bed at the given time and fall asleep `fall` minutes later
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
    var mode=S.mode,wake=mode==='wake',now=new Date();
    document.querySelectorAll('.tabs button').forEach(function(b){b.setAttribute('aria-selected',b.dataset.mode===mode)});
    $('timeLabel').textContent=wake?'I need to wake up at':'I am getting into bed at';
    $('time').value=S.time;$('fall').value=S.fall;$('cyc').value=S.cyc;$('fmt').value=S.fmt;
    $('now').hidden=wake;   // "Use the time now" only makes sense for bedtime
    var a=base(),r=calc(wake?'wake':'bed',a,S.fall,S.cyc),first=r[0].date,late=S.fall?' (you fall asleep about '+S.fall+' min later)':'';
    $('hint').textContent=wake?'To wake up at '+fmt(a)+', get into bed at one of these times:'
      :'If you get into bed at '+fmt(a)+late+', set your alarm for one of these times:';
    $('results').innerHTML=r.map(function(x){
      var best=x.cycles>=5&&x.cycles<=6,past=wake&&x.date<now,after=wake&&x.date.getDate()!==first.getDate();
      var asleep=wake&&S.fall?'<div class="m">asleep by '+fmt(new Date(x.date.getTime()+S.fall*6e4))+'</div>':'';
      return '<div class="res'+(best?' best':'')+(past?' past':'')+'"><div class="t">'+fmt(x.date)+'</div>'+(after?'<div class="m">after midnight</div>':'')+
        '<div class="m">'+hm(x.minutes)+' of sleep</div>'+asleep+(past?'<span class="tag gone">Already passed</span>':best?'<span class="tag">Best</span>':'')+'</div>';
    }).join('');
  }
  document.querySelectorAll('.tabs button').forEach(function(b){
    b.onclick=function(){S.mode=b.dataset.mode;save();render()}});
  $('time').oninput=function(){if(this.value){S.time=this.value;save();render()}};
  $('now').onclick=function(){var d=new Date();S.time=pad(d.getHours())+':'+pad(d.getMinutes());S.mode='bed';save();render()};
  $('fall').onchange=function(){S.fall=Math.min(120,Math.max(0,parseInt(this.value,10)||0));save();render()};
  $('cyc').onchange=function(){S.cyc=Math.min(120,Math.max(60,parseInt(this.value,10)||90));save();render()};
  $('fmt').onchange=function(){S.fmt=this.value;save();render()};
  if(S.mode!=='wake'&&S.mode!=='bed')S.mode='bed';
  render();
  if('serviceWorker' in navigator&&location.protocol.indexOf('http')===0)navigator.serviceWorker.register('sw.js').catch(function(){});
})();
