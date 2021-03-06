var express 		= require("express"),
	router 			= express.Router(),
	async 			= require('async'),
	multer 			= require('multer'),
	upload 			= multer({ dest: './public/images/uploads/' });

//require Schemas and middleware
var Campground 		= require("../models/campground"),
	User 			= require('../models/user'),
	Comment 		= require('../models/comments'),
	middlewareObj 	= require("../middleware/index"),
	passportConf 	= require('../config/passport');


//===================================================
//REST ROUTES
//===================================================

function paginate(req, res, next) {
	var perPage = 8;
	var page = req.params.page || 1;
	var output = {
		data: null,
		pages: {
			current: page,
			prev: 0,
			hasPrev: false,
			next: 0,
			hasNext: false,
			total: 0
		},
		items: {
        	begin: ((page * perPage) - perPage) + 1,
        	end: page * perPage,
        	total: 0
      	}
	};
	Campground
	.find()
	.skip((page - 1) * perPage)
    .limit(perPage)
    .populate('location')	
    .exec(function(err, allCampgrounds) {
      	if(err) return next(err);
      	Campground.count().exec(function(err, count) {
      		if(err) return next(err);
      		output.items.total = count;
      		output.data = allCampgrounds;
        	output.pages.total = Math.ceil(output.items.total / perPage);
      		if(output.pages.current < output.pages.total) {
      			output.pages.next = Number(output.pages.current) + 1;
      		} else {
      			output.pages.next = 0;
      		}      
      		output.pages.hasNext = (output.pages.next !== 0);
      		output.pages.prev = output.pages.current - 1;
     	 	output.pages.hasPrev = (output.pages.prev !== 0);
      		if (output.items.end > output.items.total) {
        		output.items.end = output.items.total;
      		}
      		res.render('campgrounds/index', {
    			campgrounds: allCampgrounds,
    			output: output
    		});
      	});
    });
}	
	
router.get("/", function(req, res, next){
	paginate(req, res, next);
});

router.get('/page/:page', function(req, res, next){
	paginate(req, res, next);
});

router.get("/new", passportConf.isAuthenticated, function(req, res){
	res.render("campgrounds/new");
});

router.post("/", passportConf.isAuthenticated, upload.single('image'), function(req, res, next){
	if(req.file) {
 		console.log('Uploading file...');
 		var image = req.file.filename;
 		console.log('Uploading compleate!');
 	} else {
 		console.log('No file upload...');
 		var image = 'noimage.jpg';
 	}
	//get data from form and add it to the campground object.
	var campground = new Campground();
	campground.name = req.body.name;
	campground.price = req.body.price;
	campground.image = image;
	campground.description = req.body.description;
	campground.author = {
		id: req.user._id,
		username: req.user.username
	};
	campground.save(function(err) {
		if(err) {
			console.error(err);
			return next(err);
		} else {
			User.findById(req.user.id, function(err, foundUser) {
				if(err) return next(err);
				foundUser.campgrounds.push(campground);
				foundUser.save();
				req.flash("success", 'Created new campground "' + campground.name + '"!');
				res.redirect("/campgrounds");
			});
		}
	});
});


router.get("/:id", function(req, res){
	Campground.findById(req.params.id).populate("comments").populate("ratings").exec(function(err, foundCampground){
		if(err){
			req.flash("error", err.message);
			res.redirect('/campgrounds');
		} else{
			if(foundCampground.ratings.length > 0) {
				var ratings = [];
				var length = foundCampground.ratings.length;
				foundCampground.ratings.forEach(function(rating) {
					ratings.push(rating.rating)
				});
				var rating = retings.reduce(function(total, element) {
					return total + element;
				});
				foundCampground.rating = rating / length;
				foundCampground.save();
			}
			console.log("Ratings:", foundCampground.ratings);
        	console.log("Rating:", foundCampground.rating);
			res.render("campgrounds/show", {Campground: foundCampground});
		}
	});
});

//Edit campground routes
router.get("/:id/edit", middlewareObj.checkCampgroundOwnership, function(req, res, next){
		Campground.findById(req.params.id, function(err, foundCampground){
		if(err) return next(err);
		res.render("campgrounds/edit", {Campground: foundCampground});
	});
});

router.put("/:id", middlewareObj.checkCampgroundOwnership, function(req, res, next){
	Campground.findByIdAndUpdate(req.params.id, req.body.Campground, function(err, updatedCampground){
		if(err){
			req.flash("error", err.message);
			res.redirect("/campgrounds");
		} else {
			User.findById(req.user.id, function(err, foundUser) {
				if(err) return next(err);
				foundUser.campgrounds.push(updatedCampground);
				foundUser.save();
				req.flash("success", updatedCampground.name + " Campground updated!");
				res.redirect("/campgrounds/" + req.params.id);	
			});
		}		
	});
});

router.post("/:id/image", middlewareObj.checkCampgroundOwnership, upload.single('image'), function(req, res, next) {
	Campground.findById(req.params.id, function(err, foundCampground){
		if(err) return next(err);
		if(req.file) {
			console.log('Uploading file...');
			var image = req.file.filename;
 			console.log('Uploading compleate!');
 		} else {
 			console.log('No file upload...');
 			var image = 'noimage.jpg';
 		}
 		foundCampground.image = image;
 		foundCampground.save(function(err) {
 			if(err) return next(err);
 			req.flash('success', "Image for campground " +foundCampground.name +" has been updated!");
 			res.redirect('/campgrounds/' + req.params.id);
 		});
	});
});

//Delete campground route
router.delete("/:id", middlewareObj.checkCampgroundOwnership, function(req, res, next){
	Campground.findById(req.params.id, function(err, foundCampground) {
		if(err) return next(err);
		Comment.remove({"_id": {"$in": foundCampground.comments}}, function(err) {
			if(err) return next(err);
			foundCampground.remove(function(err){
				if(err){
					req.flash("error", err.message);
					res.redirect("/campgrounds");
				} else {
					req.flash("success", "Campground deleted!");
					res.redirect("/profile");
				}
			});
		});	
	});
});

module.exports = router;