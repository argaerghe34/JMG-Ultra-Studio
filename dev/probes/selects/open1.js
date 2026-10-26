US.tools.open("selects"); await new Promise(r => setTimeout(r, 400)); const v = document.querySelector(".view"); v.scrollTop = 430; return v.scrollHeight;
