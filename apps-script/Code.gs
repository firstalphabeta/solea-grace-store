/** Jewellery store backend (Google Apps Script). Bound to the Google Sheet. See README. */
const S = {
  Products:['product_id','name','category','description','image_url','active','featured','created_at','badge'],
  Product_Variants:['variant_id','product_id','label','sku','price','cost','stock','min_stock','active'],
  Categories:['category_id','name'],
  Orders:['order_id','reference','client_key','created_at','customer_id','name','phone','email','address','region','method','subtotal','discount','delivery_fee','total','amount_paid','payment_status','order_status','delivery_status','notes','discount_code'],
  Order_Items:['item_id','order_id','variant_id','product_name','variant_label','qty','unit_price','unit_cost'],
  Customers:['customer_id','name','phone','email','address','created_at','notes'],
  Inventory_Movements:['movement_id','variant_id','type','qty','order_id','note','created_at'],
  Payments:['payment_id','order_id','type','amount','method','paid_at','reference','note','admin'],
  Order_History:['history_id','order_id','field','old_value','new_value','admin','created_at'],
  Discounts:['code','type','value','min_order','max_uses','used','starts','expires','active'],
  Custom_Orders:['request_id','created_at','name','phone','email','type','material','colour','size','budget','description','status'],
  Expenses:['expense_id','date','category','description','amount','method','reference','notes'],
  Settings:['key','value'],
  Admin_Users:['email','salt','hash','role']
};
const STATUSES=['Pending','Confirmed','Processing','Ready for Dispatch','Dispatched','Delivered','Completed','Cancelled','Returned'];

function setup(){ // run once from the editor
  const ss=SpreadsheetApp.getActive();
  Object.keys(S).forEach(n=>{let s=ss.getSheetByName(n)||ss.insertSheet(n);
    if(s.getLastRow()===0){s.appendRow(S[n]);s.setFrozenRows(1);}
    const headers=s.getRange(1,1,1,Math.max(s.getLastColumn(),1)).getValues()[0];
    S[n].filter(k=>headers.indexOf(k)<0).forEach(k=>s.getRange(1,s.getLastColumn()+1).setValue(k));});
  if(sh('Settings').getLastRow()<2) [['business_name',''],['whatsapp_number',''],['delivery_fee_accra',''],['delivery_fee_other',''],['low_stock_default','3']].forEach(r=>sh('Settings').appendRow(r));
  refreshDashboard();
}
function authorizeImageUploads(){DriveApp.getRootFolder().getName();}
function createAdmin(){ // edit the two values, run once, then delete them from the script
  const email='owner@example.com', password='CHANGE-ME-12chars+';
  const salt=Utilities.getUuid();
  add('Admin_Users',{email:email.toLowerCase(),salt:salt,hash:hash(salt,password),role:'owner'});
}
const sh=n=>SpreadsheetApp.getActive().getSheetByName(n);
function rows(n){const v=sh(n).getDataRange().getValues();const h=v.shift();return v.map((r,i)=>{const o={_row:i+2};h.forEach((k,j)=>o[k]=r[j]);return o;});}
function add(n,o){sh(n).appendRow(S[n].map(k=>o[k]===undefined?'':o[k]));}
function setCell(n,row,col,val){
  const sheet=sh(n),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0],index=headers.indexOf(col);
  if(index<0)throw new Error('Missing column '+col+' in '+n);
  sheet.getRange(row,index+1).setValue(val);
}
const uid=p=>p+'-'+Utilities.getUuid().slice(0,8).toUpperCase();
const now=()=>new Date().toISOString();
function hash(salt,pw){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+pw).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function settings(){const o={};rows('Settings').forEach(r=>o[r.key]=r.value);return o;}
const out=o=>ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const fail=m=>({ok:false,error:m});
const digits=p=>String(p).replace(/[^\d+]/g,'');

function doGet(){
  const st=settings(), vs=rows('Product_Variants').filter(v=>v.active===true||v.active==='TRUE');
  const products=rows('Products').filter(p=>p.active===true||p.active==='TRUE').map(p=>({
    id:p.product_id,name:p.name,category:p.category,description:p.description,image:p.image_url,badge:p.badge||'',featured:p.featured===true,
    variants:vs.filter(v=>v.product_id===p.product_id).map(v=>({id:v.variant_id,label:v.label,sku:v.sku,price:+v.price,inStock:+v.stock>0,stock:Math.min(+v.stock,10)}))}));
  const categories=Array.from(new Set(rows('Categories').map(c=>String(c.name||'').trim()).concat(products.map(p=>String(p.category||'').trim())).filter(Boolean)));
  return out({ok:true,products:products,categories:categories,
    settings:{business_name:st.business_name,whatsapp_number:st.whatsapp_number,delivery_fee_accra:Number(st.delivery_fee_accra)||0,delivery_fee_other:Number(st.delivery_fee_other)||0}});
}

function doPost(e){
  let d; try{d=JSON.parse(e.postData.contents);}catch(x){return out(fail('Bad request'));}
  try{
    if(d.action==='login') return out(login(d));
    if(d.action==='placeOrder') return out(refreshDashboardAfterWrite(locked(()=>placeOrder(d))));
    if(d.action==='customRequest') return out(refreshDashboardAfterWrite(customRequest(d)));
    if(String(d.action).indexOf('admin')===0){
      const who=CacheService.getScriptCache().get('t:'+d.token); if(!who) return out({ok:false,error:'Session expired',auth:false});
      const fn={adminOrders:adminOrders,adminSummary:adminSummary,adminSetStatus:d=>locked(()=>setStatus(d,who)),
        adminPayment:d=>locked(()=>recordPayment(d,who)),adminAddExpense:addExpense,adminExpenses:()=>({ok:true,expenses:rows('Expenses').reverse().slice(0,200)}),
        adminProducts:adminProducts,adminUpdateProduct:adminUpdateProduct,adminUploadImage:adminUploadImage}[d.action];
      const result=fn?fn(d):fail('Unknown action');
      return out(result.ok&&['adminSetStatus','adminPayment','adminAddExpense'].indexOf(d.action)>=0?refreshDashboardAfterWrite(result):result);
    }
    return out(fail('Unknown action'));
  }catch(err){console.error(err);return out(fail('Server error'));}
}
function locked(fn){const l=LockService.getScriptLock();l.waitLock(20000);try{return fn();}finally{l.releaseLock();}}

function login(d){
  const c=CacheService.getScriptCache(), k='a:'+String(d.email).toLowerCase(), n=+(c.get(k)||0);
  if(n>=5) return fail('Too many attempts. Try again in 15 minutes.');
  const u=rows('Admin_Users').find(r=>r.email===String(d.email).toLowerCase());
  if(!u||hash(u.salt,String(d.password))!==u.hash){c.put(k,String(n+1),900);return fail('Wrong email or password');}
  const t=Utilities.getUuid()+Utilities.getUuid(); c.put('t:'+t,u.email,21600); return {ok:true,token:t};
}

function placeOrder(d){
  const old=rows('Orders').find(o=>o.client_key&&o.client_key===d.clientKey);
  if(old) return {ok:true,reference:old.reference,total:+old.total,duplicate:true};
  const name=String(d.name||'').trim(), phone=digits(d.phone||''), email=String(d.email||'').trim(), method=d.method;
  if(name.length<2) return fail('Enter your name'); if(!/^\+?\d{9,15}$/.test(phone)) return fail('Enter a valid phone number');
  if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Enter a valid email');
  if(['delivery','pickup'].indexOf(method)<0) return fail('Choose delivery or pickup');
  if(method==='delivery'&&(!d.address||!d.region)) return fail('Delivery address and region are required');
  if(!Array.isArray(d.items)||!d.items.length||d.items.length>30) return fail('Your cart is empty');
  const vs=rows('Product_Variants'), ps=rows('Products'), lines=[]; let subtotal=0;
  for(const it of d.items){
    const v=vs.find(x=>x.variant_id===it.variantId), q=Math.floor(+it.qty);
    if(!v||!(v.active===true||v.active==='TRUE')||!(q>=1&&q<=20)) return fail('An item in your cart is no longer available');
    const p=ps.find(x=>x.product_id===v.product_id);
    if(+v.stock<q) return fail(p.name+' ('+v.label+') has only '+v.stock+' left');
    lines.push({v:v,p:p,q:q}); subtotal+=q*+v.price;
  }
  let discount=0, code=String(d.discountCode||'').trim().toUpperCase(), dr=null;
  if(code){dr=rows('Discounts').find(x=>String(x.code).toUpperCase()===code);const t=new Date();
    if(!dr||!(dr.active===true||dr.active==='TRUE')||(dr.starts&&new Date(dr.starts)>t)||(dr.expires&&new Date(dr.expires)<t)||(dr.max_uses&&+dr.used>=+dr.max_uses)||subtotal<(+dr.min_order||0)) return fail('That discount code is not valid');
    discount=Math.min(subtotal,dr.type==='percent'?Math.round(subtotal*dr.value)/100:+dr.value);}
  const st=settings(), fee=method==='pickup'?0:(String(d.region).toLowerCase().indexOf('accra')>=0?Number(st.delivery_fee_accra)||0:Number(st.delivery_fee_other)||0);
  const total=subtotal-discount+fee, orderId=uid('ORD'), ref='JW-'+Utilities.formatDate(new Date(),'Africa/Accra','yyMMdd')+'-'+Math.floor(1000+Math.random()*9000);
  const cust=rows('Customers').find(c=>digits(c.phone)===phone); const cid=cust?cust.customer_id:uid('CUS');
  if(!cust) add('Customers',{customer_id:cid,name:name,phone:"'"+phone,email:email,address:d.address||'',created_at:now()});
  add('Orders',{order_id:orderId,reference:ref,client_key:d.clientKey||'',created_at:now(),customer_id:cid,name:name,phone:"'"+phone,email:email,address:d.address||'',region:d.region||'',method:method,
    subtotal:subtotal,discount:discount,delivery_fee:fee,total:total,amount_paid:0,payment_status:'Unpaid',order_status:'Pending',delivery_status:'Not dispatched',notes:String(d.notes||'').slice(0,500),discount_code:dr?code:''});
  lines.forEach(l=>{
    add('Order_Items',{item_id:uid('ITM'),order_id:orderId,variant_id:l.v.variant_id,product_name:l.p.name,variant_label:l.v.label,qty:l.q,unit_price:+l.v.price,unit_cost:+l.v.cost||0});
    setCell('Product_Variants',l.v._row,'stock',+l.v.stock-l.q);
    add('Inventory_Movements',{movement_id:uid('MOV'),variant_id:l.v.variant_id,type:'sold',qty:-l.q,order_id:orderId,created_at:now()});});
  if(dr) setCell('Discounts',dr._row,'used',(+dr.used||0)+1);
  add('Order_History',{history_id:uid('HIS'),order_id:orderId,field:'order_status',old_value:'',new_value:'Pending',admin:'customer',created_at:now()});
  return {ok:true,reference:ref,total:total};
}

function customRequest(d){
  const f=['name','phone','email','type','material','colour','size','budget','description'], o={request_id:uid('REQ'),created_at:now(),status:'New'};
  f.forEach(k=>o[k]=String(d[k]||'').slice(0,1000));
  if(o.name.length<2||!/^\+?\d{9,15}$/.test(digits(o.phone))||o.description.length<5) return fail('Please fill in your name, phone and idea');
  o.phone="'"+digits(o.phone); add('Custom_Orders',o); return {ok:true};
}

function adminOrders(){
  const items=rows('Order_Items'), os=rows('Orders').reverse().slice(0,200);
  return {ok:true,statuses:STATUSES,orders:os.map(o=>Object.assign({},o,{items:items.filter(i=>i.order_id===o.order_id)}))};
}
function adminProducts(){
  return {ok:true,products:rows('Products').map(p=>({id:p.product_id,name:p.name,category:p.category||'',badge:p.badge||'',image:p.image_url||'',active:p.active===true||p.active==='TRUE'})).sort((a,b)=>String(a.name).localeCompare(String(b.name)))};
}
function adminUpdateProduct(d){
  const p=rows('Products').find(x=>x.product_id===d.productId);
  if(!p)return fail('Product not found');
  const category=String(d.category||'').trim(),badge=String(d.badge||'').trim(),image=String(d.imageUrl||'').trim();
  if(category.length>100)return fail('Category must be 100 characters or fewer');
  if(['','New','Limited Edition','Sale','Sold out'].indexOf(badge)<0)return fail('Choose a valid product badge');
  if(image.length>2000||image&&!/^https?:\/\/\S+$/i.test(image))return fail('Enter a valid http or https image URL');
  setCell('Products',p._row,'category',category);
  setCell('Products',p._row,'badge',badge);
  setCell('Products',p._row,'image_url',image);
  return {ok:true};
}
function adminUploadImage(d){
  const p=rows('Products').find(x=>x.product_id===d.productId);
  if(!p)return fail('Product not found');
  const mime=String(d.mimeType||'').toLowerCase(),data=String(d.data||'');
  if(['image/jpeg','image/png','image/webp','image/gif'].indexOf(mime)<0)return fail('Choose a JPG, PNG, WebP or GIF image');
  if(!data||data.length>Math.ceil(5*1024*1024*4/3))return fail('Image must be 5 MB or smaller');
  try{
    const safeName=String(d.fileName||'product-image').replace(/[^\w.-]/g,'_').slice(0,100)||'product-image';
    const file=DriveApp.createFile(Utilities.newBlob(Utilities.base64Decode(data),mime,safeName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
    const image='https://drive.google.com/uc?export=view&id='+file.getId();
    setCell('Products',p._row,'image_url',image);
    return {ok:true,image:image};
  }catch(err){
    console.error('Product image upload failed: '+err);
    return fail('Image upload failed. Check Drive authorization and available storage, then try again.');
  }
}
function log(orderId,field,a,b,who){add('Order_History',{history_id:uid('HIS'),order_id:orderId,field:field,old_value:a,new_value:b,admin:who,created_at:now()});}
function setStatus(d,who){
  const o=rows('Orders').find(x=>x.order_id===d.orderId); if(!o) return fail('Order not found');
  if(STATUSES.indexOf(d.status)<0) return fail('Invalid status'); if(o.order_status===d.status) return {ok:true};
  if(o.order_status==='Cancelled') return fail('Cancelled orders cannot be reopened. Create a new order.');
  if(d.status==='Cancelled'){
    const vs=rows('Product_Variants');
    rows('Order_Items').filter(i=>i.order_id===o.order_id).forEach(i=>{const v=vs.find(x=>x.variant_id===i.variant_id);
      if(v){setCell('Product_Variants',v._row,'stock',+v.stock+ +i.qty);add('Inventory_Movements',{movement_id:uid('MOV'),variant_id:v.variant_id,type:'cancel_restore',qty:+i.qty,order_id:o.order_id,created_at:now()});}});
  }
  setCell('Orders',o._row,'order_status',d.status);
  const ds={Dispatched:'Dispatched',Delivered:'Delivered',Completed:'Delivered'}[d.status]; if(ds) setCell('Orders',o._row,'delivery_status',ds);
  log(o.order_id,'order_status',o.order_status,d.status,who); return {ok:true};
}
function recordPayment(d,who){
  const o=rows('Orders').find(x=>x.order_id===d.orderId); if(!o) return fail('Order not found');
  const amt=Math.round(+d.amount*100)/100, refund=d.type==='refund', paid=+o.amount_paid;
  if(!(amt>0)) return fail('Enter an amount above 0');
  if(!refund&&amt>+o.total-paid+0.001) return fail('Amount is more than the outstanding balance');
  if(refund&&amt>paid+0.001) return fail('Refund is more than the amount paid');
  const np=refund?paid-amt:paid+amt, status=np<=0?(refund?'Refunded':'Unpaid'):(np<+o.total?'Partially Paid':'Paid');
  add('Payments',{payment_id:uid('PAY'),order_id:o.order_id,type:refund?'refund':'payment',amount:amt,method:d.method||'Other',paid_at:now(),reference:d.reference||'',note:d.note||'',admin:who});
  setCell('Orders',o._row,'amount_paid',np); setCell('Orders',o._row,'payment_status',status);
  log(o.order_id,'payment_status',o.payment_status,status,who); return {ok:true,payment_status:status,amount_paid:np};
}
function addExpense(d){
  if(!(+d.amount>0)||!d.category) return fail('Category and amount are required');
  add('Expenses',{expense_id:uid('EXP'),date:d.date||now().slice(0,10),category:d.category,description:d.description||'',amount:+d.amount,method:d.method||'',reference:d.reference||'',notes:d.notes||''}); return {ok:true};
}
function adminSummary(d){
  const from=d.from?new Date(d.from):new Date(0), to=d.to?new Date(d.to+'T23:59:59'):new Date();
  const os=rows('Orders').filter(o=>{const t=new Date(o.created_at);return t>=from&&t<=to;}), live=os.filter(o=>o.order_status!=='Cancelled'&&o.order_status!=='Returned');
  const ids={};live.forEach(o=>ids[o.order_id]=1);
  const cogs=rows('Order_Items').filter(i=>ids[i.order_id]).reduce((s,i)=>s+i.qty*i.unit_cost,0);
  const exp=rows('Expenses').filter(x=>{const t=new Date(x.date);return t>=from&&t<=to;}).reduce((s,x)=>s+ +x.amount,0);
  const rev=live.reduce((s,o)=>s+ +o.total,0), cash=live.reduce((s,o)=>s+ +o.amount_paid,0), by={};
  os.forEach(o=>by[o.order_status]=(by[o.order_status]||0)+1);
  const low=rows('Product_Variants').filter(v=>(v.active===true||v.active==='TRUE')&&+v.stock<=(+v.min_stock||0));
  return {ok:true,orders:os.length,byStatus:by,revenue:rev,cashReceived:cash,outstanding:rev-cash,cogs:cogs,grossProfit:rev-cogs,expenses:exp,netProfit:rev-cogs-exp,lowStock:low.length,
    note:'Estimates only. Revenue counts non-cancelled orders; cash counts recorded payments; COGS uses variant cost at time of sale.'};
}

function refreshDashboardAfterWrite(result){
  try{refreshDashboard();return result;}
  catch(err){console.error('Dashboard refresh failed after data was saved: '+err);return Object.assign({},result,{dashboardWarning:'Data was saved, but the Dashboard sheet could not refresh. Run refreshDashboard from Apps Script.'});}
}

function onEdit(e){
  if(!e||!e.range)return;
  const name=e.range.getSheet().getName();
  if(!Object.prototype.hasOwnProperty.call(S,name))return;
  try{refreshDashboard();}
  catch(err){console.error('Dashboard refresh failed after a sheet edit: '+err);}
}

function refreshDashboard(){
  const ss=SpreadsheetApp.getActive();
  const dash=ss.getSheetByName('Dashboard')||ss.insertSheet('Dashboard');
  dash.getCharts().forEach(chart=>dash.removeChart(chart));
  dash.clear();
  const orders=rows('Orders'),items=rows('Order_Items'),expenses=rows('Expenses');
  const products=rows('Products'),variants=rows('Product_Variants'),customers=rows('Customers'),requests=rows('Custom_Orders');
  const live=orders.filter(o=>!['cancelled','returned'].includes(String(o.order_status).toLowerCase()));
  const liveIds={};live.forEach(o=>liveIds[o.order_id]=true);
  const revenue=live.reduce((sum,o)=>sum+(Number(o.total)||0),0);
  const received=live.reduce((sum,o)=>sum+(Number(o.amount_paid)||0),0);
  const outstanding=live.reduce((sum,o)=>sum+(String(o.payment_status).toLowerCase()==='refunded'?0:Math.max(0,(Number(o.total)||0)-(Number(o.amount_paid)||0))),0);
  const cogs=items.filter(i=>liveIds[i.order_id]).reduce((sum,i)=>sum+(Number(i.qty)||0)*(Number(i.unit_cost)||0),0);
  const expenseTotal=expenses.reduce((sum,e)=>sum+(Number(e.amount)||0),0);
  const activeVariants=variants.filter(v=>v.active===true||v.active==='TRUE');
  const stockValue=activeVariants.reduce((sum,v)=>sum+(Number(v.stock)||0)*(Number(v.cost)||0),0);
  const lowStock=variants.filter(v=>(v.active===true||v.active==='TRUE')&&(Number(v.stock)||0)<=(Number(v.min_stock)||0)).length;
  const openRequests=requests.filter(r=>!['completed','closed','cancelled'].includes(String(r.status).toLowerCase())).length;
  const kpis=[
    ['Gross sales',revenue,'Payments received',received,'Outstanding balance',outstanding,'Estimated net profit',revenue-cogs-expenseTotal],
    ['Orders',orders.length,'Customers',customers.length,'Custom requests',openRequests,'Low-stock variants',lowStock],
    ['Active products',products.filter(p=>p.active===true||p.active==='TRUE').length,'Inventory cost value',stockValue,'Operating expenses',expenseTotal,'Estimated COGS',cogs]
  ];
  const tz=Session.getScriptTimeZone(),today=new Date(),monthly={};
  for(let offset=11;offset>=0;offset--){
    const date=new Date(today.getFullYear(),today.getMonth()-offset,1);
    const key=Utilities.formatDate(date,tz,'yyyy-MM');
    monthly[key]={label:Utilities.formatDate(date,tz,'MMM yyyy'),sales:0,orders:0};
  }
  live.forEach(o=>{
    const date=new Date(o.created_at);
    if(isNaN(date.getTime()))return;
    const key=Utilities.formatDate(date,tz,'yyyy-MM');
    if(monthly[key]){monthly[key].sales+=Number(o.total)||0;monthly[key].orders++;}
  });
  const statuses=STATUSES.map(status=>[status,orders.filter(o=>String(o.order_status)===status).length]);
  const best={};
  items.filter(i=>liveIds[i.order_id]).forEach(i=>{
    const name=String(i.product_name||'Unnamed product');
    best[name]=(best[name]||0)+(Number(i.qty)||0);
  });
  const topProducts=Object.keys(best).map(name=>[name,best[name]]).sort((a,b)=>b[1]-a[1]).slice(0,10);
  if(!topProducts.length)topProducts.push(['No sales yet',0]);

  dash.getRange('A1:I1').breakApart().merge().setValue('SOLEA GRACE  |  BUSINESS DASHBOARD');
  dash.getRange('A1:I1').setBackground('#14201B').setFontColor('#FFFFFF').setFontSize(18).setFontWeight('bold');
  dash.getRange('A2').setValue('Last refreshed');
  dash.getRange('B2').setValue(new Date());
  dash.getRange('B2').setNumberFormat('dd mmm yyyy, hh:mm');
  const labels=[['Gross sales','Payments received','Outstanding balance','Estimated net profit'],
    ['Orders','Customers','Open custom requests','Low-stock variants'],
    ['Active products','Inventory cost value','Operating expenses','Estimated COGS']];
  labels.forEach((row,r)=>{
    const sheetRow=4+r*3;
    for(let i=0;i<4;i++){
      const labelCol=1+i*2,valueCol=labelCol+1;
      dash.getRange(sheetRow,labelCol).setValue(row[i]).setFontColor('#5C6660').setFontWeight('bold');
      dash.getRange(sheetRow+1,valueCol).setValue(kpis[r][valueCol-1]).setFontSize(16).setFontWeight('bold').setBackground('#F3F1EC');
    }
  });
  [2,4,6,8].forEach(col=>dash.getRange(5,col).setNumberFormat('"GHS " #,##0.00'));
  [4,6,8].forEach(col=>dash.getRange(11,col).setNumberFormat('"GHS " #,##0.00'));
  dash.getRange(12,1,1,3).setValues([['Month','Sales (GHS)','Orders']]);
  dash.getRange(13,1,12,3).setValues(Object.keys(monthly).map(k=>[monthly[k].label,monthly[k].sales,monthly[k].orders]));
  dash.getRange(12,5,1,2).setValues([['Order status','Orders']]);
  dash.getRange(13,5,statuses.length,2).setValues(statuses);
  dash.getRange(12,8,1,2).setValues([['Best sellers','Units sold']]);
  dash.getRange(13,8,topProducts.length,2).setValues(topProducts);
  dash.getRange('A12:C12').setFontWeight('bold').setBackground('#E9E7E2');
  dash.getRange('E12:F12').setFontWeight('bold').setBackground('#E9E7E2');
  dash.getRange('H12:I12').setFontWeight('bold').setBackground('#E9E7E2');
  dash.getRange('B13:B24').setNumberFormat('"GHS " #,##0.00');
  dash.setFrozenRows(2);
  dash.setColumnWidth(1,170);dash.setColumnWidth(2,145);dash.setColumnWidth(3,110);
  dash.setColumnWidth(4,28);dash.setColumnWidth(5,160);dash.setColumnWidth(6,110);
  dash.setColumnWidth(7,28);dash.setColumnWidth(8,210);dash.setColumnWidth(9,110);
  dash.newChart().setChartType(Charts.ChartType.COLUMN).addRange(dash.getRange(12,1,13,2))
    .setPosition(27,1,0,0).setOption('title','Monthly gross sales').setOption('legend',{position:'none'})
    .setOption('colors',['#8F6F2A']).setOption('width',520).setOption('height',300).build();
  dash.newChart().setChartType(Charts.ChartType.PIE).addRange(dash.getRange(12,5,1+statuses.length,2))
    .setPosition(27,6,0,0).setOption('title','Orders by status').setOption('pieHole',0.45)
    .setOption('width',520).setOption('height',300).build();
  dash.newChart().setChartType(Charts.ChartType.BAR).addRange(dash.getRange(12,8,1+topProducts.length,2))
    .setPosition(44,1,0,0).setOption('title','Top-selling products').setOption('legend',{position:'none'})
    .setOption('colors',['#526B5B']).setOption('width',760).setOption('height',320).build();
}
