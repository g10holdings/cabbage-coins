//const lightbox = document.createElement('div');
//lightbox.id = 'lightbox-form';
//document.body.appendChild(lightbox) ;

const lightbox = document.getElementById('lightbox-form');

const formbutton = document.getElementById('lightbox-form-button');

const listingsLatest = document.getElementById('listings-latest');
const listingsPrice = document.getElementById('listings-price');
const listingsDate = document.getElementById('listings-date');
const listingsAlpha = document.getElementById('listings-alpha');
const sortingDropdown = document.getElementById('sort');
const soldCheckbox = document.getElementById('show-sold-check')

var soldListings = document.getElementsByClassName('sold-listing');

if (listingsLatest){
    hide(listingsLatest);
    hide(listingsPrice);
    hide(listingsDate);
    getSelectValue();
    showSold();
}

if (formbutton){
formbutton.addEventListener('click', e=>{
    lightbox.classList.add('active');
})
}

if (lightbox){
lightbox.addEventListener('click', e =>{
    if (e.target !== e.currentTarget) return
    lightbox.classList.remove('active');
})
}

if(soldCheckbox){
soldCheckbox.addEventListener('change', function(){
    if (this.checked){
        showSold();
    }
    else{
        hideSold();
    }
})
}

if(sortingDropdown){
sortingDropdown.addEventListener("change", getSelectValue);
}

function getSelectValue(){
    var selectedValue = sortingDropdown.value;
    console.log(selectedValue);
    switch (selectedValue){
        case 'price':
            hide(listingsAlpha);
            hide(listingsLatest);
            hide(listingsDate);
            show(listingsPrice);
            console.log("price selected, arranging by price");
            break;
        case 'date':
            hide(listingsAlpha);
            hide(listingsLatest);
            hide(listingsPrice);
            show(listingsDate)
            console.log("date selected, arranging by mint date");
            break;
        case 'newest':
            hide(listingsAlpha);
            hide(listingsDate);
            hide(listingsPrice);
            show(listingsLatest);
            console.log("newest selected, arranging by newest");
            break;
        case 'alphabetical':
            hide(listingsDate);
            hide(listingsPrice);
            hide(listingsLatest);
            show(listingsAlpha);
            console.log("alphabetical selected, arranging by name");
            break;
        default:
            break;
    } 

}

function show(d){
    d.classList.add('active');
}

function hide(d){
    d.classList.remove('active');
}

function hideSold(){
    for (listing of soldListings){
        hide(listing)
    }
    getSelectValue();
}

function showSold(){
    for (listing of soldListings){
        show(listing)
    }
    getSelectValue();
}