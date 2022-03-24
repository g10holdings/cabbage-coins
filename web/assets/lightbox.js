//const lightbox = document.createElement('div');
//lightbox.id = 'lightbox-form';
//document.body.appendChild(lightbox) ;

const lightbox = document.getElementById('lightbox-form');

const formbutton = document.getElementById('lightbox-form-button');

const listingsLatest = document.getElementById('listings-latest');
const listingsPriceAsc = document.getElementById('listings-priceasc');
const listingsPriceDsc = document.getElementById('listings-pricedsc');
const listingsDateAsc = document.getElementById('listings-dateasc');
const listingsDateDsc = document.getElementById('listings-datedsc');
const sortingDropdown = document.getElementById('sort');
const soldCheckbox = document.getElementById('show-sold-check')

var soldListings = document.getElementsByClassName('sold-listing');

if (listingsLatest){
    hide(listingsDateAsc);
    hide(listingsDateDsc);
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
        case 'priceasc':
            hide(listingsLatest);
            hide(listingsDateAsc);
            hide(listingsDateDsc);
            show(listingsPriceAsc);
            hide(listingsPriceDsc);
            console.log("price selected, arranging by price");
            break;
        case 'pricedsc':
            hide(listingsLatest);
            hide(listingsDateAsc);
            hide(listingsDateDsc);
            hide(listingsPriceAsc);
            show(listingsPriceDsc);
            console.log("price selected, arranging by price");
            break;
        case 'dateasc':
            hide(listingsLatest);
            show(listingsDateAsc);
            hide(listingsDateDsc);
            hide(listingsPriceAsc);
            hide(listingsPriceDsc);
            console.log("date selected, arranging by mint date");
            break;
        case 'datedsc':
            hide(listingsLatest);
            hide(listingsDateAsc);
            show(listingsDateDsc);
            hide(listingsPriceAsc);
            hide(listingsPriceDsc);
            console.log("date selected, arranging by mint date");
            break;
        case 'newest':
            show(listingsLatest);
            hide(listingsDateAsc);
            hide(listingsDateDsc);
            hide(listingsPriceAsc);
            hide(listingsPriceDsc);
            console.log("newest selected, arranging by newest");
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