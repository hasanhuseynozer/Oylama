document.addEventListener("click",event=>{
  if(event.target.closest(".server-page,.server-page-header,.global-sponsor"))return;
  location.href="/";
});
