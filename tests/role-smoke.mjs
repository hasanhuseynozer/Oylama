const base=process.env.TEST_BASE_URL||"http://127.0.0.1:8791",adminPassword=process.env.TEST_ADMIN_PASSWORD;
if(!adminPassword)throw new Error("TEST_ADMIN_PASSWORD gerekli");
const stamp=Date.now(),created={users:[],server:null};
async function call(path,{cookie="",...options}={}){const headers={origin:base,...(options.headers||{})};if(cookie)headers.cookie=cookie;const response=await fetch(base+path,{...options,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`${options.method||"GET"} ${path}: ${response.status} ${data.error||""}`);return{data,cookie:response.headers.get("set-cookie")?.split(";")[0]||cookie,status:response.status}}
const jsonBody=value=>({headers:{"content-type":"application/json"},body:JSON.stringify(value)});
let adminCookie="",ownerCookie="",userCookie="";
try{
  const ownerEmail=`owner-${stamp}@test.local`,userEmail=`user-${stamp}@test.local`,password="Test12345";
  ownerCookie=(await call("/api/auth/register",{method:"POST",...jsonBody({displayName:`Owner${stamp}`,email:ownerEmail,password})})).cookie;
  userCookie=(await call("/api/auth/register",{method:"POST",...jsonBody({displayName:`User${stamp}`,email:userEmail,password})})).cookie;
  adminCookie=(await call("/api/admin/login",{method:"POST",...jsonBody({password:adminPassword})})).cookie;
  let dashboard=(await call("/api/admin/dashboard",{cookie:adminCookie})).data;
  const owner=dashboard.users.find(x=>x.email===ownerEmail),user=dashboard.users.find(x=>x.email===userEmail);created.users=[owner.id,user.id];
  await call(`/api/admin/users/${owner.id}/role`,{method:"PUT",cookie:adminCookie,...jsonBody({role:"owner"})});
  const made=await call("/api/admin/servers",{method:"POST",cookie:adminCookie,...jsonBody({name:`Bot Server ${stamp}`,description:"Otomatik yetki testi",cap:110,server_type:"EU/CH",operational_status:"offline",status_note:"Test",owner_user_id:owner.id,is_active:true})});created.server=made.data.id||null;
  dashboard=(await call("/api/admin/dashboard",{cookie:adminCookie})).data;const server=dashboard.servers.find(x=>x.name===`Bot Server ${stamp}`);created.server=server.id;
  const ownerDash=(await call("/api/owner/dashboard",{cookie:ownerCookie})).data;if(!ownerDash.servers.some(x=>x.id===server.id))throw new Error("Sahip ataması görünmedi");
  await call(`/api/owner/servers/${server.id}/change-request`,{method:"POST",cookie:ownerCookie,...jsonBody({description:"Sahip tarafından doğrudan güncellendi",operational_status:"online",status_note:"Çevrimiçi"})});
  const review=await call(`/api/servers/${server.id}/reviews`,{method:"POST",cookie:userCookie,...jsonBody({rating:4,comment:"Otomatik kullanıcı testi"})});
  const detail=(await call(`/api/servers/${server.id}`,{cookie:userCookie})).data,reviewId=detail.reviews[0].id;
  await call(`/api/reviews/${reviewId}`,{method:"PUT",cookie:userCookie,...jsonBody({rating:5,comment:"Otomatik kullanıcı testi güncellendi"})});
  await call(`/api/reviews/${reviewId}/reaction`,{method:"POST",cookie:ownerCookie,...jsonBody({reaction:"like"})});
  const forbidden=await fetch(`${base}/api/reviews/${reviewId}/comments`,{method:"POST",headers:{"content-type":"application/json",cookie:userCookie,origin:base},body:JSON.stringify({comment:"yasak yanıt"})});if(forbidden.status!==403)throw new Error("Normal kullanıcı yanıtı engellenmedi");
  const adminRoute=await fetch(base+"/admin");if(adminRoute.status!==404)throw new Error("/admin 404 değil");
  console.log("ROLE_SMOKE_OK");
}finally{
  if(adminCookie&&created.server)await fetch(`${base}/api/admin/servers/${created.server}`,{method:"DELETE",headers:{cookie:adminCookie,origin:base}});
  if(adminCookie)for(const id of created.users)await fetch(`${base}/api/admin/users/${id}`,{method:"DELETE",headers:{cookie:adminCookie,origin:base}});
}
