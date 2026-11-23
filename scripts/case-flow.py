# Builds the "behind the screen" swimlane diagram as inline SVG for case-study.html
from html import escape as e
W=1100; LW=200; G=15; X0=20
INK='#161412'; MUTED='#57524C'; BLUE='#1E6FA6'; GREEN='#1E7A4C'; RED='#EE3B3B'
lanes=[('You','the parent','#EEF6FC'),('The agent','Claude','#FFF7D9'),('Piece of Cake server','checks and signs','#F4F1EC'),('Stripe','test mode','#EAF5EE'),('The stores','real listings, simulated checkout','#FFF0EE')]
def lx(i): return X0+i*(LW+G)
out=[]
def box(lane,y,title,lines,kind='plain',num=None):
    x=lx(lane)+10; w=LW-20; h=36+17*len(lines)+8
    stroke={'plain':INK,'consent':BLUE,'money':GREEN,'enforce':GREEN,'refused':RED,'whatif':RED}[kind]
    fill={'enforce':'#E3F2E8','refused':'#FDECEA','whatif':'#FDECEA'}.get(kind,'#fff')
    dash=' stroke-dasharray="6 4"' if kind=='whatif' else ''
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="2"{dash}/>')
    tx=x+14
    if num:
        c={'consent':BLUE,'money':GREEN,'enforce':GREEN}.get(kind,INK)
        out.append(f'<circle cx="{x+22}" cy="{y+22}" r="10" fill="{c}"/><text x="{x+22}" y="{y+26}" text-anchor="middle" class="n">{num}</text>')
        tx=x+38
    out.append(f'<text x="{tx}" y="{y+27}" class="t">{e(title)}</text>')
    for k,l in enumerate(lines): out.append(f'<text x="{x+14}" y="{y+50+17*k}" class="b">{e(l)}</text>')
    return dict(x=x,y=y,w=w,h=h,cx=x+w/2,r=x+w,b=y+h)
def path(pts,color=INK,label=None,lx_=None,ly=None,dash=False):
    d='M'+' L'.join(f'{a} {b}' for a,b in pts)
    m={INK:'ai',BLUE:'ab',RED:'ar',GREEN:'ag'}[color]
    out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2" marker-end="url(#{m})"/>')
    if label:
        out.append(f'<text x="{lx_}" y="{ly}" text-anchor="middle" class="lab" fill="{color}" stroke="#fff" stroke-width="4" paint-order="stroke">{e(label)}</text>')
def section(y,name):
    out.append(f'<line x1="10" x2="{W-10}" y1="{y}" y2="{y}" stroke="#D9D3C8"/>')
    out.append(f'<text x="{W-28}" y="{y-7}" text-anchor="end" class="sec" stroke="#FFF0EE" stroke-width="5" paint-order="stroke">{e(name)}</text>')
H=1530; TOP=100; BOT=1440
# lanes
for i,(n,s,c) in enumerate(lanes):
    out.append(f'<rect x="{lx(i)}" y="{TOP}" width="{LW}" height="{BOT-TOP}" rx="16" fill="{c}"/>')
    out.append(f'<text x="{lx(i)+LW/2}" y="{TOP+28}" text-anchor="middle" class="lh">{e(n)}</text>')
    out.append(f'<text x="{lx(i)+LW/2}" y="{TOP+46}" text-anchor="middle" class="ls">{e(s)}</text>')
# agent out of the loop
out.append(f'<rect x="{lx(1)+10}" y="545" width="{LW-20}" height="{1430-545}" rx="12" fill="none" stroke="{MUTED}" stroke-width="1.5" stroke-dasharray="4 4"/>')
out.append(f'<text x="{lx(1)+LW/2}" y="905" text-anchor="middle" class="loop">Out of the loop</text>')
out.append(f'<text x="{lx(1)+LW/2}" y="928" text-anchor="middle" class="b2">No payment tool,</text><text x="{lx(1)+LW/2}" y="946" text-anchor="middle" class="b2">no card, no passes</text>')
section(176,'PLAN')
b1=box(0,185,'Asks for the party',['Lego theme, Dec 5,','6-10 kids, bounce house','and piñata, under $600'],'consent',1)
b2=box(1,185,'Shops the listings',['Reads listings as data,','never as instructions','Proposes a cart. Can\'t pay.'],'plain',2)
b3=box(2,185,'Checks the cart',['Prices from the catalog','Nothing booked or too late','Under budget, toddler-safe','Nothing a listing pushed'],'plain',3)
bh=box(1,300,'Hidden instruction',['A test-store listing tells','AI shoppers what to buy.','Ignored and reported.'],'whatif')
b4=box(0,420,'Reviews the cart',['Answers the flag on the','bounce house, swaps','items, asks for changes'],'consent',4)
path([(b1['r'],225),(b2['x']-3,225)]); path([(b2['r'],225),(b3['x']-3,225)])
path([(b3['cx'],b3['b']),(b3['cx'],470),(b4['r']+3,470)],label='checked cart + any questions',lx_=(b4['r']+b3['cx'])/2,ly=462)
section(530,'CONSENT')
b5=box(0,555,'Approves once',['Budget: $600','A limit for each store','Ask me first over $100','Ends on the party date','Saves Stripe\'s test card'],'consent',5)
b6=box(2,555,'Seals it',['Signs the permission','(HMAC). A changed','permission is refused.'],'plain',6)
path([(b5['r'],595),(b6['x']-3,595)],BLUE,'what you approved',(b5['r']+b6['x'])/2,587)
section(710,'BUY')
out.append(f'<text x="{lx(2)+10}" y="735" class="sec">REPEATS FOR EACH STORE</text>')
bo=box(0,750,'Over $100?',['Taps Approve or Skip'],'consent')
b7=box(2,750,'Before each buy',['Store in the permission?','Under its limit?','Over $100? Asks you first'],'plain',7)
b8=box(3,750,'Makes a pass',['Shared payment token','on your saved card','Good at this store only','Max = its limit, 30 minutes'],'money',8)
path([(b7['x'],775),(bo['r']+3,775)],BLUE,'asks you',(bo['r']+b7['x'])/2,767)
path([(b7['r'],795),(b8['x']-3,795)])
b9=box(4,885,'Charges the pass',['Store runs a payment','with the pass, never','your card number'],'plain',9)
path([(b8['cx']+40,b8['b']),(b8['cx']+40,925),(b9['x']-3,925)])
b10=box(3,1000,'Enforces the limit',['Within the limit: paid','Over the limit: declined','Pass closes after one use'],'enforce',10)
path([(b9['cx'],b9['b']),(b9['cx'],1040),(b10['r']+3,1040)])
b11=box(2,1000,'Logs the result',['Pass and payment ids','for the receipt'],'plain',11)
path([(b10['x'],1040),(b11['r']+3,1040)])
section(1120,'WHEN SOMETHING CHANGES')
c1=box(4,1135,'Store asks for more',['What-if: the rental asks','$20 over its limit'],'whatif')
c2=box(3,1135,'Declines it',['Over the pass\'s limit'],'refused')
c3=box(0,1135,'Approve $20 more?',['Only within the budget;','a new pass if yes'],'consent')
path([(c1['x'],1165),(c2['r']+3,1165)],RED); path([(c2['x'],1165),(c3['r']+3,1165)],BLUE,'you decide',(c3['r']+c2['x'])/2+60,1157)
d1=box(4,1235,'The rental cancels',['What-if'],'whatif')
d2=box(3,1235,'Refunds it',['Money back to your card'],'money')
d3=box(0,1235,'Find another?',['A different rental, within','what\'s left; a second,','separate permission'],'consent')
path([(d1['x'],1265),(d2['r']+3,1265)],RED); path([(d2['x'],1265),(d3['r']+3,1265)],BLUE,'party not complete',(d3['r']+d2['x'])/2+60,1257)
section(1335,'AFTER')
e1=box(2,1345,'Checks the totals',['Never over what you','approved? Is the party','complete?'],'plain')
e0=box(0,1345,'Gets a receipt',['What you approved, what','was charged, what was','refused and by whom'],'consent',12)
path([(e1['x'],1385),(e0['r']+3,1385)],label='one record',lx_=(e0['r']+e1['x'])/2,ly=1377)
# legend
ly=H-50
leg=[(BLUE,'#fff','','Your consent'),(GREEN,'#fff','','Money, enforced by Stripe'),(RED,'#FDECEA',' stroke-dasharray="4 3"','Refused or a labeled what-if')]
x=20
for c,f,d,t in leg:
    out.append(f'<rect x="{x}" y="{ly-12}" width="16" height="16" rx="4" fill="{f}" stroke="{c}" stroke-width="2"{d}/><text x="{x+24}" y="{ly+1}" class="b">{e(t)}</text>')
    x+=24+len(t)*7.2+28
out.append(f'<text x="{W-20}" y="{ly+1}" text-anchor="end" class="b2">Stripe test mode. Nothing is ordered and no store is contacted.</text>')
head=f'''<svg class="behind" viewBox="0 0 {W} {H-20}" role="img" aria-labelledby="behindTitle behindDesc" xmlns="http://www.w3.org/2000/svg">
<title id="behindTitle">How Piece of Cake works behind the screen</title>
<desc id="behindDesc">Five lanes: you, the agent, the Piece of Cake server, Stripe, and the stores. The agent only proposes a cart. Your signed permission lets money move, Stripe makes a capped pass for each store and declines anything over it, and the receipt records every step.</desc>
<defs>{''.join(f'<marker id="{i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="{c}"/></marker>' for i,c in [('ai',INK),('ab',BLUE),('ar',RED),('ag',GREEN)])}</defs>
<style>.behind text{{font-family:'Inter Tight',system-ui,sans-serif}} .t{{font-size:15px;font-weight:800;fill:{INK};letter-spacing:-.02em}} .b{{font-size:12.5px;fill:{MUTED}}} .b2{{font-size:12.5px;fill:{MUTED}}} .n{{font-size:11px;font-weight:800;fill:#fff}} .lh{{font-size:16px;font-weight:900;fill:{INK};letter-spacing:-.02em}} .ls{{font-size:12px;fill:{MUTED}}} .sec{{font-size:11px;font-weight:800;letter-spacing:.14em;fill:{MUTED}}} .lab{{font-size:12px;font-weight:700}} .loop{{font-size:20px;font-weight:900;fill:{MUTED};letter-spacing:-.02em}}</style>
'''
svg=head+'\n'.join(o.replace(f'y="',f'y="',1) for o in out)+'</svg>'
# shift everything up: lanes start at TOP=100; no title inside svg (the page has it)
svg=svg.replace(f'viewBox="0 0 {W} {H-20}"',f'viewBox="0 90 {W} {H-110}"')
open('flow.svg','w').write(svg)
print(len(svg))
