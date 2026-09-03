const paths={
  customer:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  location:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  shipment:'<path d="M3 3h13v13H3z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="19" cy="18" r="2"/>',
  document:'<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  warning:'<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="1"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  activity:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  filter:'<path d="M4 5h16M7 12h10M10 19h4"/>'
};

function icon(name,{className='cc-icon',title=''}={}){
  const body=paths[name]||paths.activity;
  const label=title?`<title>${String(title).replace(/[&<>"']/g,'')}</title>`:'';
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="${title?'false':'true'}">${label}${body}</svg>`;
}

export {icon};
