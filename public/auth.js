const form=document.querySelector("#authForm");
const msg=document.querySelector("#authMessage");
const emailInput=document.querySelector("#email");
const emailSuggestions=document.querySelector("#emailSuggestions");
const emailDomains=["gmail.com","hotmail.com","outlook.com","yahoo.com","icloud.com","yandex.com","proton.me"];
let config={},widget=null;

async function api(url,opt={}){
  const response=await fetch(url,opt);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"İşlem başarısız.");
  return data;
}

function updateEmailSuggestions(){
  if(!emailSuggestions||!emailInput)return;
  const value=emailInput.value.trim();
  const local=value.split("@")[0].replace(/\s+/g,"");
  if(!local){emailSuggestions.replaceChildren();return;}
  const typedDomain=value.includes("@")?value.slice(value.indexOf("@")+1).toLowerCase():"";
  emailSuggestions.replaceChildren(...emailDomains
    .filter(domain=>!typedDomain||domain.startsWith(typedDomain))
    .map(domain=>Object.assign(document.createElement("option"),{value:`${local}@${domain}`})));
}

async function init(){
  config=await api("/api/config");
  if(config.turnstileSiteKey){
    const go=()=>window.turnstile
      ?widget=window.turnstile.render("#turnstile",{sitekey:config.turnstileSiteKey,theme:"light"})
      :setTimeout(go,200);
    go();
  }
}

emailInput?.addEventListener("input",updateEmailSuggestions);

form.onsubmit=async event=>{
  event.preventDefault();
  msg.textContent="";
  msg.className="message";
  const button=form.querySelector("button[type=submit]");
  const mode=form.dataset.mode;
  const password=document.querySelector("#password").value;
  const payload={
    email:emailInput.value.trim(),
    password,
    turnstileToken:widget!==null&&window.turnstile?window.turnstile.getResponse(widget):""
  };
  if(mode==="register"){
    payload.displayName=document.querySelector("#displayName").value.trim();
    payload.accountType="user";
  }
  try{
    if(mode==="register"&&(payload.displayName.length<3||payload.displayName.length>18))throw new Error("Kullanıcı adı 3–18 karakter olmalıdır.");
    if(!emailInput.validity.valid)throw new Error("Geçerli bir e-posta adresi yazın.");
    if(mode==="register"&&(password.length<8||password.length>18||!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password)||!/\d/.test(password)))throw new Error("Şifre 8–18 karakter olmalı, harf ve rakam içermelidir.");
    if(mode==="register"&&password!==document.querySelector("#passwordConfirm").value)throw new Error("Şifreler eşleşmiyor.");
    button.disabled=true;
    button.textContent="İşleniyor…";
    await api(`/api/auth/${mode}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    location.href=mode==="register"?"/profil/":"/";
  }catch(error){
    msg.textContent=error.message;
    msg.className="message bad";
    if(widget!==null&&window.turnstile)window.turnstile.reset(widget);
  }finally{
    button.disabled=false;
    button.textContent=mode==="register"?"Hesabımı Oluştur":"Giriş Yap";
  }
};

init().catch(error=>{msg.textContent=error.message;msg.className="message bad";});
