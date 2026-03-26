const lightbox = document.getElementById('lightbox-form');
const formbutton = document.getElementById('lightbox-form-button');

const listingsLatest = document.getElementById('listings-latest');
const listingsPriceAsc = document.getElementById('listings-priceasc');
const listingsPriceDsc = document.getElementById('listings-pricedsc');
const listingsCatalog = document.getElementById('listings-catalog');
const sortingDropdown = document.getElementById('sort');
const soldCheckbox = document.getElementById('show-sold-check')
const productCountAll = document.getElementById('product-count-all')
const productCountSold = document.getElementById('product-count-sold')

var soldListings = document.getElementsByClassName('sold-listing');

if (listingsCatalog){
    hide(listingsLatest);
    hide(listingsPriceAsc);
    hide(listingsPriceDsc);
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
            hide(productCountSold);
            show(productCountAll);
        }
        else{
            hideSold();
            hide(productCountAll);
            show(productCountSold);
        }
    })
}

if(sortingDropdown){
    sortingDropdown.addEventListener("change", getSelectValue);
}

function getSelectValue(){
    var selectedValue = sortingDropdown.value;
    switch (selectedValue){
        case 'catalog':
            show(listingsCatalog);
            hide(listingsLatest);
            hide(listingsPriceAsc);
            hide(listingsPriceDsc);
            break;
        case 'priceasc':
            hide(listingsCatalog);
            hide(listingsLatest);
            show(listingsPriceAsc);
            hide(listingsPriceDsc);
            break;
        case 'pricedsc':
            hide(listingsCatalog);
            hide(listingsLatest);
            hide(listingsPriceAsc);
            show(listingsPriceDsc);
            break;
        case 'newest':
            hide(listingsCatalog);
            show(listingsLatest);
            hide(listingsPriceAsc);
            hide(listingsPriceDsc);
            break;
        default:
            show(listingsCatalog);
            hide(listingsLatest);
            hide(listingsPriceAsc);
            hide(listingsPriceDsc);
            break;
    } 
}

function show(d){
    if(d) d.classList.add('active');
}

function hide(d){
    if(d) d.classList.remove('active');
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