window.ONEIRO_ROUTER={
  routes:{home:'home-view',session:'session-view',journal:'journal-view',lab:'lab-view',settings:'settings-view'},
  current:'home',
  go(route){
    if(!this.routes[route]) route='home';
    this.current=route;
    history.replaceState(null,'',`#${route}`);
    this.render();
  },
  render(){
    const app=document.getElementById('app');
    const tpl=document.getElementById(this.routes[this.current]);
    app.replaceChildren(tpl.content.cloneNode(true));
    document.querySelectorAll('[data-route]').forEach(el=>el.setAttribute('aria-current',el.dataset.route===this.current?'page':'false'));
    window.ONEIRO_APP?.afterRender?.(this.current);
    app.focus({preventScroll:true});
  },
  init(){
    document.addEventListener('click',e=>{const target=e.target.closest('[data-route]');if(target){e.preventDefault();this.go(target.dataset.route)}});
    window.addEventListener('hashchange',()=>{const route=location.hash.slice(1)||'home';if(route!==this.current)this.go(route)});
    this.go(location.hash.slice(1)||'home');
  }
};
