export function mountVisibilityControls(root){
 const section=document.createElement('section');section.className='eco-visibility';section.setAttribute('aria-label','Visibility')
 section.innerHTML=`<h2>Visibility</h2><input type="text" id="network-expanded-communities" hidden maxlength="8000" value="[]" aria-label="Expanded community identifiers">
 <label>Analysis view<select id="network-analysis-mode"><option value="network">Relationship network</option><option value="funding">Funding flow</option><option value="geography">Maryland geography</option></select></label>
 <fieldset id="network-flow-filters" hidden><legend>Funding filters</legend><label>Funding type<select id="network-flow-kind"><option value="all">All documented flows</option><option value="transfer">Transfer / award</option><option value="grant">Grant</option><option value="donation">Donation</option><option value="contract">Contract</option></select></label><label>Organization category<select id="network-flow-category"><option value="all">All categories</option></select></label><label>From date<input id="network-flow-from" type="date"></label><label>Through date<input id="network-flow-to" type="date"></label></fieldset>
 <p id="network-analysis-legend" role="status"></p>
 <label>Theme<select id="network-theme"><option value="auto">Automatic</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
 <label>Node color<select id="network-color-metric"><option value="sector">Sector</option><option value="community">Community</option></select></label>
 <label>Camera<select id="network-camera-mode"><option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label>
 <button type="button" id="network-home">Home</button><button type="button" id="network-focus">Focus selection</button>
 <label>Network detail<select id="network-detail-mode"><option value="overview">Overview</option><option value="focus">Focus</option><option value="all">All relationships (cluttered)</option></select></label>
 <label>Organization labels<select id="network-label-mode"><option value="hover">Hover</option><option value="priority" selected>Priority</option><option value="all">All (overlaps suppressed)</option></select></label>
 <label>Relationship depth<select id="network-hop-depth"><option>1</option><option>2</option><option>3</option></select></label>
 <label><input type="checkbox" id="network-clustering" checked>Community clustering</label>
 <label>Grouping<select id="network-grouping"><option value="community">Connected communities</option><option value="sector">Sector</option><option value="county">Published county</option><option value="municipality">Published municipality</option></select></label>
 <label>Background edge opacity<input id="network-edge-opacity" type="range" min="0" max="1" step="0.05" value="0.2"></label>
 <label>Node size<select id="network-size-metric"><option value="connections">Connections</option><option value="incoming">Recorded incoming USD</option><option value="outgoing">Recorded outgoing USD</option><option value="uniform">Uniform</option></select></label>
 <label>Edge encoding<select id="network-edge-encoding"><option value="neutral">Neutral</option><option value="type">Relationship type</option><option value="amount">Recorded USD amount</option></select></label>
 <label><input id="network-funding-arrows" type="checkbox">Show documented financial direction</label>
 <p class="eco-note">Organization radius 3–10 units; aggregate markers 5–14 by member count. Organization area scales with the selected metric. Missing amounts use minimum size. Recorded USD is not proof of payment. Overview shows one relationship per community pair; expand a community to inspect its records.</p>
 <div id="network-community-list" aria-label="Communities"></div>
 <button type="button" id="network-clear-selection">Clear selection</button>
 <button type="button" id="network-reset-visibility">Reset visibility</button>`
 const controls=root.querySelector('.eco-network-controls');const advanced=document.createElement('details');advanced.className='eco-network-advanced';const summary=document.createElement('summary');summary.textContent='Advanced';advanced.append(summary);while(controls.firstChild)advanced.append(controls.firstChild);controls.append(section,advanced)
 return section
}
