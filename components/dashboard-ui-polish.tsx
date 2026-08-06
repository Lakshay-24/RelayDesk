export function DashboardUiPolish(){return <style jsx global>{`
  :root{--ui-bg:#f6f6f3;--ui-surface:#fff;--ui-border:#e2e2dc;--ui-border-strong:#d3d3cc;--ui-text:#171717;--ui-muted:#71716c;--ui-radius-sm:10px;--ui-radius-md:14px;--ui-radius-lg:18px;--ui-shadow:0 10px 30px rgba(20,20,20,.05)}
  .dashboard-content{background:var(--ui-bg)!important}
  .dashboard-content button,.dashboard-content select,.dashboard-content input,.dashboard-content textarea{transition:border-color .15s ease,box-shadow .15s ease,background .15s ease,transform .15s ease}
  .dashboard-content button:focus-visible,.dashboard-content select:focus-visible,.dashboard-content input:focus-visible,.dashboard-content textarea:focus-visible{outline:3px solid rgba(79,124,255,.16)!important;outline-offset:1px!important;border-color:#8da7ff!important}
  .dashboard-content button:not(:disabled):hover{transform:translateY(-1px)}
  .button,.primary-button,.btn,.chip{min-height:40px!important;padding:9px 14px!important;border-radius:11px!important;font-size:14px!important;font-weight:750!important;line-height:1!important}
  .primary-button,.btn,.primary{background:#171717!important;color:#fff!important;border:1px solid #171717!important;box-shadow:0 3px 10px rgba(0,0,0,.12)!important}
  .secondary,.chip{background:#fff!important;color:#272724!important;border:1px solid var(--ui-border-strong)!important;box-shadow:0 1px 2px rgba(0,0,0,.025)!important}
  .chip.active{background:#171717!important;color:#fff!important;border-color:#171717!important}
  .dashboard-content input,.dashboard-content textarea,.dashboard-content select{min-height:42px!important;border:1px solid var(--ui-border-strong)!important;border-radius:11px!important;background:#fff!important;color:var(--ui-text)!important;padding:10px 12px!important}
  .dashboard-content textarea{line-height:1.5!important}
  .knowledge-page,.settings-page{width:min(1400px,100%)!important;padding:42px clamp(24px,4vw,54px)!important}
  .page-title-row{align-items:flex-end!important;margin-bottom:26px!important}
  .page-title-row h1,.knowledge-page h1,.settings-page h1{margin:0!important;font-size:clamp(34px,4vw,54px)!important;line-height:.98!important;letter-spacing:-.045em!important}
  .page-title-row p,.knowledge-page>p,.settings-page>p{color:var(--ui-muted)!important;line-height:1.55!important}
  .panel,.section-card,.article-list,.editor{border:1px solid var(--ui-border)!important;border-radius:var(--ui-radius-lg)!important;background:var(--ui-surface)!important;box-shadow:var(--ui-shadow)!important}
  .settings-grid{gap:20px!important}.settings-grid>.panel,.settings-grid>.section-card{padding:22px!important}
  .knowledge-grid{gap:20px!important}.article-list{overflow:hidden!important}.article-item{padding:16px 18px!important}.article-item.active{background:#f0f2ff!important;box-shadow:inset 3px 0 0 #5f7cff!important}
  .editor{padding:24px!important}.editor input,.editor textarea,.editor select{margin-bottom:14px!important}
  .workspace-page{background:var(--ui-bg)!important;grid-template-columns:minmax(300px,350px) minmax(0,1fr) minmax(260px,300px)!important}
  .conversation-list,.conversation-view,.context-panel{background:var(--ui-surface)!important}
  .conversation-list{border-right:1px solid var(--ui-border)!important}
  .pane-header{padding:22px 20px 18px!important;border-bottom:1px solid var(--ui-border)!important}
  .pane-header h1{font-size:30px!important;line-height:1!important;letter-spacing:-.035em!important}
  .pane-header .filters{gap:8px!important;margin-top:12px!important}
  .pane-header label{margin-top:12px!important}
  .conversation-row{padding:15px 17px!important;border-bottom:1px solid #ecece7!important}
  .conversation-row:hover{background:#fafaf8!important}.conversation-row.active{background:#f0f2ff!important;box-shadow:inset 3px 0 0 #5f7cff!important}
  .conversation-header{min-height:74px!important;padding:14px 18px!important;border-bottom:1px solid var(--ui-border)!important;gap:12px!important}
  .conversation-header .filters{gap:8px!important}.conversation-header select{min-width:118px!important;max-width:170px!important}
  .messages{padding:22px!important;gap:12px!important;background:linear-gradient(180deg,#f8f8f5 0%,#f3f3ef 100%)!important}
  .message{border-radius:16px!important;border-color:var(--ui-border)!important;box-shadow:0 3px 12px rgba(0,0,0,.035)!important}
  .composer{padding:14px 16px!important;border-top:1px solid var(--ui-border)!important;box-shadow:0 -8px 24px rgba(20,20,20,.035)!important}
  .composer textarea{min-height:96px!important;padding:12px!important;border:1px solid var(--ui-border-strong)!important;border-radius:12px!important}
  .context-panel{padding:18px!important}.context-panel .section-card{padding:16px!important;margin-bottom:12px!important;box-shadow:none!important}
  .empty-state,.empty-list{color:var(--ui-muted)!important}.empty-list{padding:28px 22px!important}
  @media(max-width:1450px){.workspace-page{grid-template-columns:minmax(300px,350px) minmax(0,1fr)!important}.context-panel{display:none!important}}
  @media(max-width:980px){.knowledge-page,.settings-page{padding:30px 22px!important}.workspace-page{grid-template-columns:minmax(280px,320px) minmax(0,1fr)!important}.conversation-header{align-items:flex-start!important;flex-direction:column!important}.conversation-header .filters{width:100%!important;justify-content:flex-start!important}}
  @media(max-width:760px){.knowledge-page,.settings-page{padding:22px 14px 96px!important}.page-title-row{align-items:flex-start!important;gap:16px!important}.workspace-page{display:block!important;min-height:calc(100svh - 82px)!important}.conversation-list{min-height:calc(100svh - 82px)!important;max-height:none!important;border-right:0!important}.conversation-view{display:none!important}.pane-header{padding:18px 15px!important}.pane-header h1{font-size:28px!important}.pane-header .filters{overflow-x:auto!important;flex-wrap:nowrap!important;padding-bottom:2px!important}.pane-header .filters>*{flex:none!important}.button,.primary-button,.btn,.chip{min-height:38px!important;padding:8px 12px!important}}
`}</style>}
