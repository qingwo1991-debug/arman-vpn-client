// Read-only UI regression. Run inside the existing browserless container with
// `docker exec -i browserless node - < browser_check.cjs` after JSON credentials
// are provided through the wrapper. Never logs credentials or account contents.
const puppeteer = require('puppeteer');
const assert = require('assert');
async function run(input) {
  const browser = await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage'],ignoreHTTPSErrors:false});
  const errors=[];
  const summary={};
  try {
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:1000});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://192.168.1.15:10820/app/',{waitUntil:'networkidle2',timeout:30000});
    await page.waitForSelector('#login-view:not([hidden])',{timeout:10000});
    summary.lang=await page.evaluate(()=>document.documentElement.lang);
    assert.equal(summary.lang,'zh-CN');
    const loginText=await page.$eval('#login-form',x=>x.innerText);
    assert(loginText.includes('用户名') && loginText.includes('密码'));
    summary.loginChinese=true;
    await page.type('#login-form input[name="username"]',input.username);
    await page.type('#login-form input[name="password"]','wrong-localization-test');
    await page.click('#login-form button[type="submit"]');
    await page.waitForFunction(()=>document.querySelector('#login-error').textContent.trim().length>0,{timeout:10000});
    const wrong=await page.$eval('#login-error',x=>x.textContent);
    assert(/[\u3400-\u9fff]/.test(wrong),'Login error must be localized');
    summary.loginErrorChinese=true;
    // User changed the initial password; never reset it or ask for it. Use a
    // private native Core session created before the gateway deployment.
    await page.setCookie({name:'fvpn_session',value:input.cookie.split('=').slice(1).join('='),url:'http://192.168.1.15:10820',httpOnly:true,sameSite:'Strict'});
    await page.reload({waitUntil:'networkidle2'});
    await page.waitForSelector('#app:not([hidden])',{timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#state-pill').textContent!=='…',{timeout:10000});
    summary.navigation=await page.$$eval('.nav-item span',xs=>xs.map(x=>x.textContent));
    assert(summary.navigation.every(x=>/[\u3400-\u9fff]/.test(x)));
    summary.pages={};
    for(const view of ['overview','accounts','locations','logs','settings','help']) {
      await page.click(`.nav-item[data-view="${view}"]`);
      await page.waitForFunction(v=>!document.querySelector('#view-'+v).hidden,{},view);
      const title=await page.$eval('#page-title',x=>x.textContent);
      assert(/[\u3400-\u9fff]/.test(title),'Untranslated page title '+view);
      summary.pages[view]=title;
    }
    await page.click('.nav-item[data-view="accounts"]');
    await page.click('#add-account');
    const dialogText=await page.$eval('#signin-dialog',x=>x.innerText);
    assert(dialogText.includes('邮箱') && dialogText.includes('密码'));
    summary.accountDialogChinese=true;
    await page.click('#signin-cancel');
    await page.click('.nav-item[data-view="locations"]');
    await page.waitForFunction(()=>document.querySelectorAll('#location-table tbody tr').length>1,{timeout:30000});
    const locationText=await page.$eval('#view-locations',x=>x.innerText);
    assert(locationText.includes('日本') && locationText.includes('新加坡') && locationText.includes('美国'),'Chinese region names missing');
    summary.regionsChinese=true;
    await page.type('#location-search','日本');
    await page.waitForFunction(()=>document.querySelector('#location-table tbody').innerText.includes('日本') && !document.querySelector('#location-table tbody').innerText.includes('新加坡'),{timeout:10000});
    summary.regionSearchChinese=true;
    await page.$eval('#location-search',x=>{x.value='';x.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.click('.nav-item[data-view="settings"]');
    const before=await page.$eval('#settings-form',x=>Array.from(x.elements).filter(y=>y.name).map(y=>[y.name,y.value,y.checked]));
    summary.settingsLoaded=before.length>10;
    assert(summary.settingsLoaded);
    // No save, proxy test, location change, account login, power or restart actions.
    await page.setViewport({width:390,height:844});
    // The desktop sidebar animates offscreen when the breakpoint changes.
    // Waiting only for the menu button's display is insufficient: during that
    // transition the sidebar's Close button can cover the same click point.
    await page.waitForFunction(()=>{
      const button=document.querySelector('#nav-toggle');
      const sidebar=document.querySelector('.sidebar');
      const r=button.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return window.innerWidth===390 && getComputedStyle(sidebar).visibility==='hidden' && button.contains(hit);
    },{timeout:10000});
    summary.mobileNavigation={};
    for(const view of ['overview','accounts','locations','logs','settings','help','overview']) {
      await page.click('#nav-toggle');
      await page.waitForFunction(()=>{
        const shell=document.querySelector('#app');
        const sidebar=document.querySelector('.sidebar');
        return shell.classList.contains('nav-open') && Math.abs(sidebar.getBoundingClientRect().left)<1;
      },{timeout:10000});
      await page.click(`.nav-item[data-view="${view}"]`);
      await page.waitForFunction(v=>!document.querySelector('#view-'+v).hidden && !document.querySelector('#app').classList.contains('nav-open') && getComputedStyle(document.querySelector('.sidebar')).visibility==='hidden',{timeout:10000},view);
      const title=await page.$eval('#page-title',x=>x.textContent);
      assert(/[\u3400-\u9fff]/.test(title),'Untranslated mobile page title '+view);
      summary.mobileNavigation[view]=title;
    }
    summary.mobileNoHorizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
    assert(summary.mobileNoHorizontalOverflow,'Mobile horizontal overflow');
    await page.screenshot({path:'/tmp/firefox-zh-mobile.png',fullPage:true});
    await page.setViewport({width:1440,height:1000});
    await page.screenshot({path:'/tmp/firefox-zh-desktop.png',fullPage:true});
    const originCheck=await page.evaluate(async()=>{
      const a=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});
      const b=await fetch('/api/settings');
      return {nonJson:a.status,settings:b.status};
    });
    assert.equal(originCheck.nonJson,415);assert.equal(originCheck.settings,200);
    summary.apiPolicy=originCheck;
    summary.consoleErrors=errors;
    assert.equal(errors.length,0);
    console.log(JSON.stringify(summary,null,2));
  } finally { await browser.close(); }
}
module.exports=run;
