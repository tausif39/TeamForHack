const express = require("express");
const bodyParser = require("body-parser");
const auth = require("../../middleware/authteacher");
const Student = require("../../models/Student");
const Teacher = require("../../models/Teacher");
const SuperUser = require("../../models/SuperUser");
const Meeting = require("../../models/Meeting");
const Discussion= require("../../models/Discussion");
const schedule = require("node-schedule");
const nodemailer=require("nodemailer");
const router = express.Router();
const keys = require("../../config/keys");
const moment = require("moment");

const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const methodOverride = require('method-override');
const { allowedNodeEnvironmentFlags } = require("process");

// Mongo URI
const mongoURI = keys.mongoURI;

// Create mongo connection
const conn = mongoose.connection;

let gfs;
conn.once('open', () => {
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection('uploads');
  });
  
  // Create storage engine
  const storage = new GridFsStorage({
    url: mongoURI,
    file: (req, file) => {
      return new Promise((resolve, reject) => {
        crypto.randomBytes(16, (err, buf) => {
          if (err) {
            return reject(err);
          }
          const filename = req.body.filename + path.extname(file.originalname);

          const fileInfo = {
            filename: filename,
            bucketName: 'uploads'
          };
          resolve(fileInfo);
        });
      });
    }
  });
const upload = multer({ storage });


const transporter = nodemailer.createTransport({
    service:'gmail', 
    auth:{
        user:'eduon.portal@gmail.com',
        pass:'lav1234@'
    }   
});

router.use(bodyParser.urlencoded({ extended: true }));


router.get("/dashboard",auth,(req,res)=>{

    Meeting.find({email:req.user.email},(err,meetings)=>{
          Discussion.find({email:req.user.email},(err,discussions)=>{

            if(err){
              throw Error(err);
            }
              
            let errors=[];

            if(req.query.f==2){
                errors.push("User does not exist");
            }
              res.render("teacherdashboard",{currentUser:req.user,
                  clientType:req.session.client,
                  meetings:meetings,
                  discussions:discussions,
                  errors:errors
              });
          });
    });

});

router.post("/meeting/add",auth,(req,res)=>{

    Meeting.create(req.body.meeting,(err,meeting)=>{

        if(err){
            res.redirect("/teacher/dashboard");
        }else{
            res.redirect("/teacher/dashboard/meeting/"+req.body.meeting.roomId);
        }

    });

});


router.post("/meeting/updatetiming/:roomid",auth,(req,res)=>{

    Meeting.findOne({roomId:req.params.roomid},async(err,meeting)=>{

      if(err){
        throw Error(err);
      }

      if(meeting.email == req.user.email){
          meeting.scheduledTime=req.body.editscheduledtime;
          await meeting.save();
          res.redirect("/teacher/dashboard/meeting/"+req.params.roomid);
      }
    });

});

router.get("/dashboard/delete/student/:roomid/:email",auth,async (req,res)=>{

  Meeting.findOne({roomId:req.params.roomid},async(err,meeting)=>{

      if(err || !meeting){
         res.redirect("/teacher/dashboard/meeting/"+req.params.roomid)
      }else if(meeting.email == req.user.email){
          let x=meeting.students.indexOf(req.params.email);
          if(x!==-1){
              meeting.students.splice(x,1);
              await meeting.save();
          }
          res.redirect("/teacher/dashboard/meeting/"+req.params.roomid)
      }

  });

});

router.get("/dashboard/meeting/:roomId",auth,(req,res)=>{ 

    Meeting.findOne({roomId:req.params.roomId},async(err,meeting)=>{
      Student.find({},async(err,students)=>{
        res.render("meetingdetails",{currentUser:req.user,
                                     clientType:req.session.client,
                                     meeting:meeting,
                                     students:students,
                                     questions:meeting.questions});
      });
    });  

});


router.post("/dashboard/question/:roomId",auth,(req,res)=>{
   
    Meeting.findOne({roomId:req.params.roomId},async(err,meeting)=>{

      if(err){
        throw Error(err);
       }

        meeting.questions.push(req.body);
        await meeting.save();
    })
    res.redirect("/teacher/dashboard/meeting/"+req.params.roomId);

});


router.get("/dashboard/question/delete/:ques/:roomId",auth,async(req,res)=>{

    Meeting.findOne({roomId:req.params.roomId},async (err,meeting)=>{

      if(err){
        throw Error(err);
      }

        const index = meeting.questions.findIndex(x => x.question === req.params.question);
        meeting.questions.splice(index,1);
        await meeting.save();
    });
      res.redirect("/teacher/dashboard/meeting/"+req.params.roomId);

});

router.post("/dashboard/:roomId",auth,async (req,res)=>{

   Meeting.findOne({roomId:req.params.roomId},async (err,meeting)=>{
       try{ 
        if(Array.isArray(req.body.main)){
            meeting.students=await meeting.students.concat(req.body.main);
            await meeting.save();
        }
        else{
            await meeting.students.push(req.body.main);
            await meeting.save();
        }
       }catch(e){
           console.log(e);
       } 
     
   });
   res.redirect("/teacher/dashboard/meeting/"+req.params.roomId);
});


router.get("/dashboard/meeting/sendmail/:roomid/:email",auth,(req,res)=>{

    Meeting.findOne({roomId:req.params.roomid},(err,meeting)=>{
        if(err){
            res.redirect("/teacher/dashboard/meeting/"+req.params.roomid);
        }else if(req.params.email == meeting.email){
            meeting.students.forEach((stud)=>{
                var mailOptions ={
                    from:'eduon.portal@gmail.com',
                    to:stud,
                    subject:"Hi , testing purpose",
                    html:"<h2>Notification for Test</h2> " +
                         "<b>"+meeting.admin+"</b>"+" invites you to give the scheduled test with Room Id <b>"
                             +meeting.roomId+"</b> at timings "+moment(meeting.scheduledTime).format('MMMM Do YYYY, h:mm:ss a')
                             +"<br>"
                             +"For any details contact <b>"+meeting.email   +"</b>"
                };
                transporter.sendMail(mailOptions,function(err,info){
                    if(err){
                        console.log(err)
                    }else{
                        console.log("Email Sent");
                    } 
                });
            });
            res.redirect("/teacher/dashboard/meeting/"+req.params.roomid);
        }
    });

});

router.get("/dashboard/leaderboard/:roomid",auth,async(req,res)=>{

  Student.find({},(err,users)=>{

    Meeting.findOne({roomId:req.params.roomid},async(err,meeting)=>{
        let students=meeting.students;
        let totalmarks=[];
        let names=[];
        await students.forEach(async(z)=>{
           await users.forEach((user)=>{
             if(z==user.email){
               names.push(user.name);
             }
           });
        });
        for(var i=0;i<students.length;i++){
          totalmarks.push(0);
        }
        let arr=[];
         meeting.questions.forEach((p,i)=>{
           let x=[];
           meeting.intestdetails.forEach((q,j)=>{
             q.ques.forEach((r,k)=>{
                 if(r.question == p.question && q.correct[k]==1){
                    x.push(q.email);
                 }
             });
           });

           x.forEach((y)=>{
               students.forEach((st,p)=>{
                   if(st==y){
                       totalmarks[p]=totalmarks[p]+1;
                   }
               })
           });
           arr.push(x);
         });
       

       res.send({students:students,totalmarks:totalmarks,arr:arr,names:names});
   });
  });

})


//////////////////////////////////////////////////////////////////
  //Discussion Routes
/////////////////////////////////////////////////////////////////


router.post("/discussion/add",auth,(req,res)=>{

    Discussion.create(req.body.discussion,(err,discussion)=>{
        if(err){
            res.redirect("/teacher/dashboard");
        }else{
            res.redirect("/teacher/dashboard/enter/discussion?room="+ req.body.discussion.roomId +"&user="+req.body.discussion.email);
        }
    });
    
})
 

router.get("/dashboard/enter/discussion",auth,(req,res)=>{

    Discussion.findOne({roomId:req.query.room},async (err,discussion)=>{
          Student.find({},async (err,students)=>{
            res.render("discussiondetails",{currentUser:req.user,
                                        clientType:req.session.client,
                                        discussion:discussion,
                                        students:students,
                                        texts:discussion.texts});
          });
      });

});

router.post("/discussion/updatetiming/:roomid/:email",auth,(req,res)=>{

    Discussion.findOne({roomId:req.params.roomid},async(err,discussion)=>{

          if(err){
            throw Error(err);
          }
          if(discussion.email == req.user.email){
            discussion.scheduledTime=req.body.editscheduledtime;
            await discussion.save();
            res.redirect("/teacher/dashboard/enter/discussion?room="+req.params.roomid+"&user="+req.params.email);
          }
      });
  
});

router.get("/dashboard/enter/discussion/classroom/:roomid",auth,(req,res)=>{

  Discussion.findOne({roomId:req.params.roomid},(err,discussion)=>{

    if(err){
      throw Error(err);
    }
    res.render("mainclassroom",{currentUser:req.user,
                                clientType:req.session.client,
                                discussion:discussion})
  });

});



router.post("/dashboard/discussion/:roomId",auth,async(req,res)=>{

    Discussion.findOne({roomId:req.params.roomId},async (err,discussion)=>{
        try{
         if(Array.isArray(req.body.main)){
             req.body.main.forEach((stud)=>{
               let x={
                   email:stud,
                   present:false
               }
               discussion.students.push(x);
             });
             await discussion.save();
         }
         else{
             let y={
                 email:req.body.main,
                 present:false
             }
             await discussion.students.push(y);
             await discussion.save();
         } 
        }catch(e){
            console.log(e);
        } 
      
    });
    res.redirect("/teacher/dashboard/enter/discussion?room="+req.params.roomId+"&user="+req.user.email);

});

router.get("/dashboard/discussion/sendemail/:roomid/:email",auth,(req,res)=>{

    Discussion.findOne({roomId:req.params.roomid},async (err,discussion)=>{
      if(err){
          res.redirect("/teacher/dashboard/enter/discussion?room="+req.params.roomid+"user="+req.params.email);
      }else if(req.params.email == discussion.email){
          await discussion.students.forEach((stud)=>{

              var mailOptions ={
                    from:'eduon.portal@gmail.com',
                    to:stud.email,
                    subject:"Hi , testing purpose",
                    html:"<h2>Notification for Discussion</h2> " +
                    "<b>"+discussion.admin+"</b>"+" invites you to attend the scheduled class with Room Id <b>"
                        +discussion.roomId+"</b> at timings "+moment(discussion.scheduledTime).format('MMMM Do YYYY, h:mm:ss a')
                        +"<br>"
                        +"For any details contact <b>"+discussion.email   +"</b>"              
                };

              transporter.sendMail(mailOptions,async (err,info)=>{
                  if(err){
                      console.log(err)
                  }else{
                      console.log("Email Sent");
                  } 
              }); 
          });
          res.redirect("/teacher/dashboard/enter/discussion?room="+req.params.roomid+"&user="+req.params.email);
      } 
  }); 

});


router.post("/dashboard/adddoc/toroom",auth,upload.single('file'),(req,res)=>{

    Discussion.findOne({roomId:req.body.roomid},async(err,discussion)=>{
        if(err){
          throw Error(err);
        }
        if(discussion.email === req.body.email && discussion.email===req.user.email){
          discussion.files.push(req.file);
          await discussion.save();
          res.redirect("/teacher/dashboard/enter/discussion?room="+req.body.roomid+"&user="+req.body.email);
        }
    });

});

router.get("/dashboard/getfile/file/:filename",(req,res)=>{

      gfs.files.findOne({filename:req.params.filename},(err,file)=>{
        if (!file || file.length === 0) {
          return res.status(404).json({
            err: 'No files exist'
          });
        }
        const readstream = gfs.createReadStream(file.filename);
        readstream.pipe(res);
      });

});

router.delete("/dashboard/files/doc/delete/:id/:roomid/:email",auth,(req,res)=>{

  gfs.remove({_id:req.params.id,root:'uploads'},(err,gridStore)=>{
    Discussion.findOne({roomId:req.params.roomid},async(err,discussion)=>{
      let i=discussion.files.findIndex(x=> x.id == req.params.id);

      discussion.files.splice(i,1);
      await discussion.save();
      
      res.redirect("/teacher/dashboard/enter/discussion?room="+req.params.roomid+"&user="+req.params.email);
    });
  });

});


///////////////////////
 //Profile Section
///////////////////////

router.get("/profile",auth,(req,res)=>{

    Student.findOne({email:req.query.email},(err,student)=>{
      if(student){

        Discussion.find({},async(err,discussions)=>{
            Meeting.find({},async(err,meetings)=>{
              
            let attendance=[],graph=[];

                let c=0;
                await discussions.forEach(async (discussion)=>{
                    let y=discussion.students.findIndex(x => x.email == req.query.email);
                    if(y!==-1){
                        attendance.push(discussion);
                        if(discussion.students[y].present === true){
                            c=c+1;
                        }
                    }
                });
                
                await meetings.forEach(async (meeting)=>{
                    let y = meeting.students.indexOf(req.query.email);
                    if(y!==-1){
                        graph.push(meeting);
                    }
                });
                
                let test=[];
                await graph.forEach(async(g)=>{
                    let x={
                      scheduledTime:g.scheduledTime,
                      roomId:g.roomId,
                      totalquestions:g.questions.length,
                    }
                  let y= g.intestdetails.findIndex(z=> z.email == req.query.email);
                  let count =0;
                  await g.intestdetails[y].correct.forEach((ee)=>{
                      if(ee==1){
                          count++;
                      }
                  });
                  x.correct = count;
                  x.percentage = (count/(x.totalquestions)*(1.0))*100;
                  test.push(x);
                });
                

                let present=[];
                await attendance.forEach((at)=>{
                    let x={
                        scheduledTime:at.scheduledTime,
                        roomId:at.roomId,
                    }
                    let y=at.students.findIndex(z => z.email ==req.query.email);
                    if(at.students[y].present ==true){
                      x.present=true;
                    }else{
                      x.present=false;
                    }
                    present.push(x);
                });
            
            let totalpercentagepresent= (c/(attendance.length)*(1.0))*100;

            res.render("teacher-studentprofile",{
                    currentUser:req.user,
                    clientType:req.session.client,
                    student:student,
                    present:present,
                    test:test,
                    totalpercentagepresentinclass:totalpercentagepresent});
            });
        });
    }else{
      res.redirect("/teacher/dashboard?f=2");
    }
  });

})
module.exports = router;
