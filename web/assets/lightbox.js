//const lightbox = document.createElement('div');
//lightbox.id = 'lightbox-form';
//document.body.appendChild(lightbox) ;

const lightbox = document.getElementById('lightbox-form');


const formbutton = document.getElementById('lightbox-form-button');

formbutton.addEventListener('click', e=>{
    lightbox.classList.add('active');
})

lightbox.addEventListener('click', e =>{
    if (e.target !== e.currentTarget) return
    lightbox.classList.remove('active');
})
