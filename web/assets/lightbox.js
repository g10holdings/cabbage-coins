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
        applyFilters();
    })
}

if(sortingDropdown){
    sortingDropdown.addEventListener("change", function() {
        getSelectValue();
        applyFilters();
    });
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
// Category filter buttons
var filterButtons = document.querySelectorAll('.filter-btn');
var cacFilterCheck = document.getElementById('cac-filter-check');
var activeCategory = 'all';
var cacOnly = false;

function applyFilters() {
    var activeGrid = document.querySelector('.listings-container > div.active');
    if (!activeGrid) return;

    var cards = activeGrid.querySelectorAll('.listing-preview-border');
    var visibleCount = 0;
    var showSold = soldCheckbox && soldCheckbox.checked;

    cards.forEach(function(card) {
        var category = card.dataset.category || '';
        var cac = card.dataset.cac === 'true';
        var isSold = card.classList.contains('sold-listing');

        // Skip sold listings if show sold is off
        if (isSold && !showSold) {
            card.style.display = 'none';
            return;
        }

        var categoryMatch = activeCategory === 'all' || category === activeCategory;
        var cacMatch = !cacOnly || cac;

        if (categoryMatch && cacMatch) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    var activeCountEl = document.querySelector('#product-count-all.active, #product-count-sold.active');
    if (activeCountEl) activeCountEl.textContent = visibleCount + ' Products';
}

if (filterButtons) {
    filterButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            filterButtons.forEach(function(b) {
                b.classList.remove('active-filter');
            });
            btn.classList.add('active-filter');
            activeCategory = btn.dataset.filter;
            applyFilters();
        });
    });
}

if (cacFilterCheck) {
    cacFilterCheck.addEventListener('change', function() {
        cacOnly = cacFilterCheck.checked;
        applyFilters();
    });
}