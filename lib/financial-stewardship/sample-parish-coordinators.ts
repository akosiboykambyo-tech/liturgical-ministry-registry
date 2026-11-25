// Fictional preview fixtures only. Never use for real authentication or SMS delivery.
export type SampleCoordinator={id:string;parish:string;slot:string;contact:string;status:"active"|"pending"|"revoked";phone:string};
export const sampleCoordinators:SampleCoordinator[]=[
 {id:"Sample Parish A-1",parish:"Sample Parish A",slot:"Primary",contact:"09•• ••• ••21",phone:"09000000021",status:"active"},
 {id:"Sample Parish A-2",parish:"Sample Parish A",slot:"Secondary",contact:"09•• ••• ••32",phone:"09000000032",status:"pending"},
 {id:"Sample Parish B-1",parish:"Sample Parish B",slot:"Primary",contact:"09•• ••• ••31",phone:"09000000031",status:"active"},
 {id:"Sample Parish B-2",parish:"Sample Parish B",slot:"Secondary",contact:"09•• ••• ••42",phone:"09000000042",status:"pending"}
];
export function normalizeSamplePhone(value:string):string{
 const digits=value.replace(/[\s()-]/g,"");
 if(/^\+639\d{9}$/.test(digits))return "0"+digits.slice(3);
 if(/^639\d{9}$/.test(digits))return "0"+digits.slice(2);
 return /^09\d{9}$/.test(digits)?digits:"";
}
export function findActiveSampleCoordinator(value:string,records:SampleCoordinator[]=sampleCoordinators){
 const phone=normalizeSamplePhone(value);
 return phone?records.find(c=>c.phone===phone&&c.status==="active"):undefined;
}
