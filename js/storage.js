window.ONEIRO_STORAGE={
  get(key,fallback=null){try{const v=localStorage.getItem(`oneiro:${key}`);return v===null?fallback:JSON.parse(v)}catch{return fallback}},
  set(key,value){try{localStorage.setItem(`oneiro:${key}`,JSON.stringify(value));return true}catch{return false}},
  remove(key){try{localStorage.removeItem(`oneiro:${key}`);return true}catch{return false}},
  clear(){try{Object.keys(localStorage).filter(k=>k.startsWith('oneiro:')).forEach(k=>localStorage.removeItem(k));return true}catch{return false}}
};
